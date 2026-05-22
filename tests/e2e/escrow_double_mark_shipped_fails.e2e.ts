/**
 * E2E: escrow_double_mark_shipped_fails
 *
 * Scenario: lock → mark-shipped → mark-shipped again (second attempt aborts)
 *
 * Asserts:
 *   - First mark-shipped succeeds
 *   - Second mark-shipped throws INVALID_STATE (escrow is already 'shipped')
 *   - escrows.status remains 'shipped' after both attempts
 *   - No duplicate order_events rows are created
 *
 * This verifies the idempotency protection: the script pre-checks
 * `escrow.status === 'pending'` before submitting on-chain. A second call
 * aborts before the chain tx is built.
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
import {
	cleanupOrder,
	createTestOrder,
	getEscrowRow,
	getOrderEvents,
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
	`escrow_double_mark_shipped_fails.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`,
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

		it('rejects a second mark-shipped on the same order', async () => {
			const lockTxHash =
				process.env.E2E_LOCK_TX_HASH ??
				'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

			await insertLockPaymentFixture({ orderId, lockTxHash });

			// Step 1: First mark-shipped — should succeed
			const firstResult = await markShipped([`--order-id`, orderId]);
			expect(firstResult.txHash).toBeTruthy();

			const shippedEscrow = await getEscrowRow(orderId);
			expect(shippedEscrow!.status).toBe('shipped');

			// Step 2: Second mark-shipped — should abort on state check
			await expect(
				markShipped([`--order-id`, orderId]),
			).rejects.toThrow('INVALID_STATE');

			// Verify state is unchanged (still 'shipped', not modified further)
			const unchangedEscrow = await getEscrowRow(orderId);
			expect(unchangedEscrow!.status).toBe('shipped');
			// The shipped_tx_hash is the first tx hash (not overwritten by second attempt)
			expect(unchangedEscrow!.shipped_tx_hash).toBe(firstResult.txHash);

			// Exactly 2 events: paid + shipped (no duplicate shipped event)
			const events = await getOrderEvents(orderId);
			const shippedEvents = events.filter(e => e.event_type === 'shipped');
			expect(shippedEvents).toHaveLength(1);
		}, 60_000);
	},
);
