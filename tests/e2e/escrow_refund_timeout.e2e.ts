/**
 * E2E: escrow_refund_timeout
 *
 * Scenario: lock → +61s → refund (buyer reclaims after ship deadline)
 *
 * Asserts:
 *   - orders.status = 'cancelled'
 *   - escrows.status = 'refunded'
 *   - 2 order_events rows (paid, cancelled)
 *   - refund tx hash is non-empty
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

import { main as refundEscrow } from '../../scripts/escrow-refund.js';
// Traceability owns orders.status + order_events (Feature A); escrow scripts own
// the escrows table (Feature B). The full walkthrough runs both.
import { main as cancelOrder } from '../../scripts/cancel-order.js';
import {
	advanceTime,
	cleanupOrder,
	createTestOrder,
	getEscrowRow,
	getOrderEvents,
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

describe.skipIf(SKIP)(`escrow_refund_timeout.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`, () => {
	let orderId: string;

	beforeEach(async () => {
		orderId = await createTestOrder();
	});

	afterEach(async () => {
		if (orderId) {
			await cleanupOrder(orderId);
		}
	});

	it('allows buyer refund after ship deadline has elapsed: lock → +61s → refund', async () => {
		const lockTxHash =
			process.env.E2E_LOCK_TX_HASH ??
			'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

		const buyerKey = process.env.TEST_BUYER_SKEY;
		if (!buyerKey) throw new Error('E2E: TEST_BUYER_SKEY is required for refund test');

		await insertLockPaymentFixture({ orderId, lockTxHash });

		// Verify initial state
		const initialEscrow = await getEscrowRow(orderId);
		expect(initialEscrow!.status).toBe('pending');

		// -----------------------------------------------------------------------
		// Step 2: Advance past the ship deadline (61s > 60s configured)
		// -----------------------------------------------------------------------
		await advanceTime(61);

		// -----------------------------------------------------------------------
		// Step 3: Submit refund (escrows table only — Pending → Refunded)
		// -----------------------------------------------------------------------
		const refundResult = await refundEscrow([`--order-id`, orderId, `--buyer-key`, buyerKey]);
		expect(refundResult.txHash).toBeTruthy();

		const finalEscrow = await getEscrowRow(orderId);
		expect(finalEscrow!.status).toBe('refunded');
		expect(finalEscrow!.refund_tx_hash).toBeTruthy();
		expect(finalEscrow!.refund_tx_hash).toBe(refundResult.txHash);

		// -----------------------------------------------------------------------
		// Step 4: Traceability — record the `cancelled` event on chain.
		//   This owns orders.status + order_events('cancelled').
		// -----------------------------------------------------------------------
		await cancelOrder([`--order-id`, orderId, `--reason`, `ship_deadline_exceeded`]);

		// -----------------------------------------------------------------------
		// Step 5: Verify final DB state
		// -----------------------------------------------------------------------
		const finalOrder = await getOrderRow(orderId);
		expect(finalOrder.status).toBe('cancelled');

		// 2 event rows: paid, cancelled
		const events = await getOrderEvents(orderId);
		expect(events).toHaveLength(2);
		const eventTypes = events.map(e => e.event_type);
		expect(eventTypes).toContain('paid');
		expect(eventTypes).toContain('cancelled');
	}, 120_000); // 2 minute timeout
});
