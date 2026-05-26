/**
 * E2E: escrow_release_before_grace_fails
 *
 * Scenario: lock → mark-shipped → release without slot advance aborts
 *
 * Asserts:
 *   - Release attempt immediately after mark-shipped throws GRACE_PERIOD_NOT_ELAPSED
 *   - escrows.status remains 'shipped'
 *   - orders.status remains 'shipped'
 *
 * This verifies the script pre-check: the merchant cannot release before the
 * grace period has elapsed (which gives the buyer time to raise a dispute).
 *
 * Requires:
 *   - Running dolos node (TX3_TRP_ENDPOINT)
 *   - Funded merchant address + skey (MERCHANT_ADDRESS, MERCHANT_SKEY)
 *   - Supabase credentials (VITE_SUPABASE_URL, SUPABASE_SECRET_KEY)
 *   - ESCROW_SHIP_DEADLINE_SECONDS=60 + ESCROW_GRACE_PERIOD_SECONDS=60
 *
 * Skip: automatically when any required env var is missing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { main as markShipped } from '../../scripts/escrow-mark-shipped.js';
import { main as releaseEscrow } from '../../scripts/escrow-release.js';
import {
	cleanupOrder,
	createTestOrder,
	getEscrowRow,
	getOrderRow,
	insertLockPaymentFixture,
	isE2eConfigured,
	missingE2eVars,
} from './_fixtures/dolos.js';

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

const SKIP = !isE2eConfigured();
const SKIP_REASON = SKIP ? `Missing env vars: ${missingE2eVars().join(', ')}` : '';

describe.skipIf(SKIP)(
	`escrow_release_before_grace_fails.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`,
	() => {
		let orderId: string;

		beforeEach(async () => {
			orderId = await createTestOrder();
		});

		afterEach(async () => {
			if (orderId) {
				await cleanupOrder(orderId);
			}
		});

		it('rejects release before grace period has elapsed', async () => {
			const lockTxHash =
				process.env.E2E_LOCK_TX_HASH ??
				'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

			await insertLockPaymentFixture({ orderId, lockTxHash });

			// Step 1: Mark shipped (should succeed)
			await markShipped([`--order-id`, orderId]);

			const shippedEscrow = await getEscrowRow(orderId);
			expect(shippedEscrow!.status).toBe('shipped');
			expect(shippedEscrow!.grace_period_end).not.toBeNull();

			// Step 2: Immediately attempt release (no time advance).
			// grace_period_end is ~60s in the future — the script pre-check
			// aborts with GRACE_PERIOD_NOT_ELAPSED before any chain call.
			await expect(
				releaseEscrow([`--order-id`, orderId]),
			).rejects.toThrow('GRACE_PERIOD_NOT_ELAPSED');

			// DB state must be unchanged
			const unchangedEscrow = await getEscrowRow(orderId);
			expect(unchangedEscrow!.status).toBe('shipped');
			expect(unchangedEscrow!.release_tx_hash).toBeNull();

			// orders.status stays 'paid': only escrow scripts ran here, and they no
			// longer touch orders.status (that is the traceability scripts' job).
			const unchangedOrder = await getOrderRow(orderId);
			expect(unchangedOrder.status).toBe('paid');
		}, 60_000);
	},
);
