/**
 * E2E: badge_seller_first_delivery
 *
 * Scenario: Complete escrow lifecycle, then mint seller-first-delivery badge.
 *
 * Asserts:
 *   - mint-badge --kind seller-first-delivery succeeds with non-empty txHash
 *   - issued_badges row exists with kind = 'seller_first_delivery'
 *   - issued_badges recipient_pkh matches the merchant pkh from the escrow
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

describe.skipIf(SKIP)(`badge_seller_first_delivery.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`, () => {
	let orderId: string;

	beforeEach(async () => {
		orderId = await createTestOrder();
	});

	afterEach(async () => {
		if (orderId) {
			await cleanupOrder(orderId);
		}
	});

	it('mints a seller-first-delivery badge after completed escrow lifecycle', async () => {
		// Step 1: Complete the escrow lifecycle
		await setupEscrowLifecycle(orderId);

		// Step 2: Mint seller-first-delivery badge
		const mintResult = await mintBadge([
			'--order-id', orderId,
			'--kind', 'seller-first-delivery',
		]);
		expect(mintResult.txHash).toBeTruthy();
		expect(typeof mintResult.txHash).toBe('string');
		expect(mintResult.txHash.length).toBeGreaterThan(0);

		// Step 3: Verify issued_badges row
		const badges = await getIssuedBadges(orderId);
		expect(badges).toHaveLength(1);
		expect(badges[0]!.kind).toBe('seller_first_delivery');
		expect(badges[0]!.mint_tx_hash).toBe(mintResult.txHash);

		// Step 4: Verify recipient_pkh matches merchant
		const expectedPkh = await getExpectedRecipientPkh(orderId, 'seller_first_delivery');
		expect(badges[0]!.recipient_pkh).toBe(expectedPkh);
	}, 180_000);
});
