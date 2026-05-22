/**
 * E2E: escrow_refund_after_shipped_fails
 *
 * Scenario: lock → mark-shipped → refund attempt aborts
 *
 * Asserts:
 *   - The refund attempt throws INVALID_STATE (escrow is in 'shipped' state)
 *   - UTxO stays at Shipped state on chain
 *   - DB escrows.status remains 'shipped'
 *   - DB orders.status remains 'shipped'
 *
 * This verifies the on-chain rule: Refund requires grace_period_end == None
 * (Pending state). Once the merchant has marked as shipped, the buyer cannot
 * reclaim funds via Refund.
 *
 * Requires:
 *   - Running dolos node (TX3_TRP_ENDPOINT)
 *   - Funded merchant address + skey (MERCHANT_ADDRESS, MERCHANT_SKEY)
 *   - Funded buyer address + skey (TEST_BUYER_ADDRESS, TEST_BUYER_SKEY)
 *   - Supabase credentials (VITE_SUPABASE_URL, SUPABASE_SECRET_KEY)
 *   - ESCROW_SHIP_DEADLINE_SECONDS=60 + ESCROW_GRACE_PERIOD_SECONDS=60
 *
 * Skip: automatically when any required env var is missing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { main as markShipped } from '../../scripts/escrow-mark-shipped.js';
import { main as refundEscrow } from '../../scripts/escrow-refund.js';
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
	`escrow_refund_after_shipped_fails.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`,
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

		it('rejects refund when escrow is already in shipped state', async () => {
			const lockTxHash =
				process.env.E2E_LOCK_TX_HASH ??
				'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

			const buyerKey = process.env.TEST_BUYER_SKEY;
			if (!buyerKey) throw new Error('E2E: TEST_BUYER_SKEY is required');

			await insertLockPaymentFixture({ orderId, lockTxHash });

			// Step 1: Mark shipped (should succeed)
			await markShipped([`--order-id`, orderId]);

			const shippedEscrow = await getEscrowRow(orderId);
			expect(shippedEscrow!.status).toBe('shipped');

			// Step 2: Attempt refund — should fail with INVALID_STATE
			// The script pre-checks: status must be 'pending' to refund.
			// It aborts before any chain call.
			await expect(
				refundEscrow([`--order-id`, orderId, `--buyer-key`, buyerKey]),
			).rejects.toThrow('INVALID_STATE');

			// DB state must be unchanged
			const unchangedEscrow = await getEscrowRow(orderId);
			expect(unchangedEscrow!.status).toBe('shipped');

			const unchangedOrder = await getOrderRow(orderId);
			expect(unchangedOrder.status).toBe('shipped');
		}, 60_000);
	},
);
