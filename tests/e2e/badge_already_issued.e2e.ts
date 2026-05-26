/**
 * E2E: badge_already_issued
 *
 * Scenario: Complete escrow → mint badge → try to mint same badge again.
 *
 * Asserts:
 *   - First mint succeeds with non-empty txHash
 *   - Second mint with same args throws with message containing 'BADGE_ALREADY_ISSUED'
 *   - Only ONE issued_badges row exists for this (kind, recipient_pkh)
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

describe.skipIf(SKIP)(`badge_already_issued.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`, () => {
	let orderId: string;

	beforeEach(async () => {
		orderId = await createTestOrder();
	});

	afterEach(async () => {
		if (orderId) {
			await cleanupOrder(orderId);
		}
	});

	it('rejects a duplicate mint with BADGE_ALREADY_ISSUED', async () => {
		// Step 1: Complete the escrow lifecycle
		await setupEscrowLifecycle(orderId);

		// Step 2: First mint succeeds
		const firstResult = await mintBadge([
			'--order-id', orderId,
			'--kind', 'buyer-first-purchase',
		]);
		expect(firstResult.txHash).toBeTruthy();

		// Step 3: Second mint with same args throws BADGE_ALREADY_ISSUED
		await expect(
			mintBadge(['--order-id', orderId, '--kind', 'buyer-first-purchase']),
		).rejects.toThrow(/BADGE_ALREADY_ISSUED/i);

		// Step 4: Only ONE issued_badges row exists
		const badges = await getIssuedBadges(orderId);
		expect(badges).toHaveLength(1);
		expect(badges[0]!.kind).toBe('buyer_first_purchase');
		expect(badges[0]!.mint_tx_hash).toBe(firstResult.txHash);
	}, 180_000);
});
