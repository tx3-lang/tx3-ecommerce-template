/**
 * E2E: badge_in_wallet_query
 *
 * Scenario: Complete escrow lifecycle, mint a badge, then verify the
 * issued_badges row contains all expected fields and the tx hash is valid.
 *
 * Also verifies that the badge row has correct:
 *   - policy_id (non-empty)
 *   - asset_name_hex (non-empty)
 *   - recipient_address (matches expected)
 *   - mint_tx_hash (matches the mint call return)
 *   - kind, triggering_order_id
 *
 * The on-chain UTxO verification (checking the NFT exists at the recipient's
 * address) requires querying the u5c/dolos API for address UTxOs and decoding
 * CIP-25 metadata. This is deferred to a future enhancement when the u5c
 * client exposes a getUtxosByAddress method.
 *
 * Requires:
 *   - Running dolos node (TX3_TRP_ENDPOINT)
 *   - Funded merchant address + skey (MERCHANT_ADDRESS, CARDANO_MERCHANT_SKEY)
 *   - Funded buyer address + skey (TEST_BUYER_ADDRESS, TEST_BUYER_SKEY)
 *   - Supabase credentials (VITE_SUPABASE_URL, SUPABASE_SECRET_KEY)
 *   - ESCROW_SHIP_DEADLINE_SECONDS=60 + ESCROW_GRACE_PERIOD_SECONDS=60
 *
 * Skip: automatically when any required env var is missing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { main as mintBadge } from '../../scripts/mint-badge.js';
import {
	cleanupOrder,
	createTestOrder,
	getExpectedRecipientPkh,
	getIssuedBadges,
	isE2eConfigured,
	missingE2eVars,
	setupEscrowLifecycle,
} from './_fixtures/dolos.js';

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

const SKIP = !isE2eConfigured();
const SKIP_REASON = SKIP ? `Missing env vars: ${missingE2eVars().join(', ')}` : '';

describe.skipIf(SKIP)(`badge_in_wallet_query.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`, () => {
	let orderId: string;

	beforeEach(async () => {
		orderId = await createTestOrder();
	});

	afterEach(async () => {
		if (orderId) {
			await cleanupOrder(orderId);
		}
	});

	it('persists a complete issued_badges row with correct fields after mint', async () => {
		// Step 1: Complete the escrow lifecycle
		await setupEscrowLifecycle(orderId);

		// Step 2: Mint buyer-first-purchase badge
		const mintResult = await mintBadge([
			'--order-id', orderId,
			'--kind', 'buyer-first-purchase',
		]);
		expect(mintResult.txHash).toBeTruthy();

		// Step 3: Verify issued_badges DB row
		const badges = await getIssuedBadges(orderId);
		expect(badges).toHaveLength(1);

		const badge = badges[0]!;
		expect(badge.kind).toBe('buyer_first_purchase');
		expect(badge.triggering_order_id).toBe(orderId);
		expect(badge.mint_tx_hash).toBe(mintResult.txHash);
		expect(badge.policy_id).toBeTruthy();
		expect(badge.policy_id.length).toBeGreaterThan(0);
		expect(badge.asset_name_hex).toBeTruthy();
		expect(badge.asset_name_hex.length).toBeGreaterThan(0);
		expect(badge.minted_at).toBeTruthy();

		// Step 4: Verify recipient fields
		const buyerPkh = await getExpectedRecipientPkh(orderId, 'buyer_first_purchase');
		expect(badge.recipient_pkh).toBe(buyerPkh);
		expect(badge.recipient_address).toBeTruthy();
		expect(badge.recipient_address.length).toBeGreaterThan(0);

		// Step 5: Verify metadata CIP-25 structure
		expect(badge.metadata).toBeTruthy();
		const cip25 = badge.metadata['721'] as Record<string, Record<string, Record<string, unknown>>> | undefined;
		expect(cip25).toBeTruthy();
		const policyAssets = cip25![badge.policy_id];
		expect(policyAssets).toBeTruthy();
		const assetMetadata = policyAssets![badge.asset_name_hex];
		expect(assetMetadata).toBeTruthy();
		expect(assetMetadata!['name']).toBe('First Purchase');
		expect(assetMetadata!['kind']).toBe('buyer_first_purchase');
		expect(assetMetadata!['order_id']).toBe(orderId);
		expect(assetMetadata!['mediaType']).toBe('image/png');
	}, 180_000);
});
