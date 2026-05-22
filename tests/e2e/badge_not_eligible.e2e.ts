/**
 * E2E: badge_not_eligible
 *
 * Scenario: Set up 2 orders, both with released escrows for the same buyer.
 * The buyer already has >1 released escrow (count != 1), so the
 * buyer-first-purchase eligibility check should fail.
 *
 * Asserts:
 *   - mint-badge for orderId2 throws with message containing 'ELIGIBILITY_NOT_MET'
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

describe.skipIf(SKIP)(`badge_not_eligible.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`, () => {
	let orderId1: string;
	let orderId2: string;

	beforeEach(async () => {
		orderId1 = await createTestOrder();
		orderId2 = await createTestOrder();
	});

	afterEach(async () => {
		if (orderId1) await cleanupOrder(orderId1);
		if (orderId2) await cleanupOrder(orderId2);
	});

	it('rejects mint when buyer has >1 released escrow (not first purchase)', async () => {
		// Step 1: Complete escrow lifecycle for first order
		await setupEscrowLifecycle(orderId1);

		// Step 2: Complete escrow lifecycle for second order (same buyer)
		await setupEscrowLifecycle(orderId2);

		// Step 3: Try to mint buyer-first-purchase for the second order
		// The buyer now has 2 released escrows (count > 1), so eligibility fails
		await expect(
			mintBadge(['--order-id', orderId2, '--kind', 'buyer-first-purchase']),
		).rejects.toThrow(/ELIGIBILITY_NOT_MET/i);

		// Step 4: No issued_badges row exists for either order
		const badges1 = await getIssuedBadges(orderId1);
		expect(badges1).toHaveLength(0);
		const badges2 = await getIssuedBadges(orderId2);
		expect(badges2).toHaveLength(0);
	}, 300_000); // 5 min for two advanceTime(61) cycles
});
