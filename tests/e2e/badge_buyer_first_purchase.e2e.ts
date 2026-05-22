/**
 * E2E: badge_buyer_first_purchase
 *
 * Scenario: Complete escrow lifecycle, then mint buyer-first-purchase badge.
 *
 * Asserts:
 *   - mint-badge --kind buyer-first-purchase succeeds with non-empty txHash
 *   - issued_badges row exists with kind = 'buyer_first_purchase'
 *   - issued_badges row has non-empty asset_name_hex
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

describe.skipIf(SKIP)(`badge_buyer_first_purchase.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`, () => {
	let orderId: string;

	beforeEach(async () => {
		orderId = await createTestOrder();
	});

	afterEach(async () => {
		if (orderId) {
			await cleanupOrder(orderId);
		}
	});

	it('mints a buyer-first-purchase badge after completed escrow lifecycle', async () => {
		// Step 1: Complete the escrow lifecycle
		await setupEscrowLifecycle(orderId);

		// Step 2: Mint buyer-first-purchase badge
		const mintResult = await mintBadge([
			'--order-id', orderId,
			'--kind', 'buyer-first-purchase',
		]);
		expect(mintResult.txHash).toBeTruthy();
		expect(typeof mintResult.txHash).toBe('string');
		expect(mintResult.txHash.length).toBeGreaterThan(0);

		// Step 3: Verify issued_badges row
		const badges = await getIssuedBadges(orderId);
		expect(badges).toHaveLength(1);
		expect(badges[0]!.kind).toBe('buyer_first_purchase');
		expect(badges[0]!.mint_tx_hash).toBe(mintResult.txHash);
		expect(badges[0]!.asset_name_hex).toBeTruthy();
		expect(badges[0]!.asset_name_hex.length).toBeGreaterThan(0);
	}, 180_000);
});
