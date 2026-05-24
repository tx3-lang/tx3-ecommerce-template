/**
 * E2E: escrow_happy_release
 *
 * Scenario (full combined walkthrough — traceability + escrow):
 *   lock → mark-order-shipped (traceability) + escrow-mark-shipped (escrow)
 *        → +61s → escrow-release (escrow) → mark-order-completed (traceability)
 *
 * Ownership: traceability scripts own orders.status + order_events (Feature A);
 * escrow scripts own the escrows table (Feature B).
 *
 * Asserts:
 *   - orders.status = 'completed'        (set by mark-order-completed)
 *   - escrows.status = 'released'        (set by escrow-release)
 *   - 3 order_events rows exist (paid, shipped, completed)
 *   - All tx hashes are non-empty strings
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
import { main as releaseEscrow } from '../../scripts/escrow-release.js';
// Traceability scripts own orders.status + order_events (Feature A); the escrow
// scripts own only the escrows table (Feature B). The full walkthrough runs both.
import { main as markOrderCompleted } from '../../scripts/mark-order-completed.js';
import { main as markOrderShipped } from '../../scripts/mark-order-shipped.js';
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
// Skip guard — tests are skipped if the e2e environment is not configured.
// ---------------------------------------------------------------------------

const SKIP = !isE2eConfigured();
const SKIP_REASON = SKIP ? `Missing env vars: ${missingE2eVars().join(', ')}` : '';

describe.skipIf(SKIP)(`escrow_happy_release.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`, () => {
	let orderId: string;

	beforeEach(async () => {
		orderId = await createTestOrder();
	});

	afterEach(async () => {
		if (orderId) {
			await cleanupOrder(orderId);
		}
	});

	it('completes the full happy-path lifecycle: lock → +61s → mark-shipped → +61s → release', async () => {
		// -----------------------------------------------------------------------
		// Step 1: Simulate the buyer's lock tx being submitted on-chain.
		//
		// In a full e2e run, the buyer would sign a `lock_escrow_ada` tx via
		// the checkout UI. Here we use a fixture tx hash — replace with a real
		// tx hash when running against a funded dolos devnet.
		//
		// E2E_LOCK_TX_HASH can be set to a pre-funded tx hash for the buyer UTxO.
		// If not set, the test uses a placeholder that will fail on real chain calls.
		// -----------------------------------------------------------------------
		const lockTxHash =
			process.env.E2E_LOCK_TX_HASH ??
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

		await insertLockPaymentFixture({
			orderId,
			lockTxHash,
			lockOutputIndex: 0,
		});

		// Verify initial state
		const initialOrder = await getOrderRow(orderId);
		expect(initialOrder.status).toBe('paid');

		const initialEscrow = await getEscrowRow(orderId);
		expect(initialEscrow).not.toBeNull();
		expect(initialEscrow!.status).toBe('pending');

		// -----------------------------------------------------------------------
		// Step 2: Advance past the ship deadline (61s > 60s deadline).
		// This satisfies the Refund time constraint. For MarkShipped we need
		// to be BEFORE the ship deadline, so we advance AFTER the first assertion.
		//
		// Wait 0s here — the test advances time for the grace period after
		// mark-shipped. For mark-shipped itself, we run it immediately (no
		// advancement needed since the ship deadline is in the future).
		// -----------------------------------------------------------------------

		// -----------------------------------------------------------------------
		// Step 3a: Traceability — record the `shipped` event on chain.
		//   This owns orders.status + order_events('shipped').
		// -----------------------------------------------------------------------
		await markOrderShipped([`--order-id`, orderId, `--tracking`, `E2E-TRACK-001`]);

		const shippedOrder = await getOrderRow(orderId);
		expect(shippedOrder.status).toBe('shipped');

		// -----------------------------------------------------------------------
		// Step 3b: Escrow state machine — Pending → Shipped.
		//   This owns the escrows table only (no orders / order_events writes).
		// -----------------------------------------------------------------------
		const shippedResult = await markShipped([`--order-id`, orderId]);
		expect(shippedResult.txHash).toBeTruthy();
		expect(typeof shippedResult.txHash).toBe('string');

		const shippedEscrow = await getEscrowRow(orderId);
		expect(shippedEscrow!.status).toBe('shipped');
		expect(shippedEscrow!.shipped_tx_hash).toBeTruthy();
		expect(shippedEscrow!.grace_period_end).not.toBeNull();

		// -----------------------------------------------------------------------
		// Step 4: Advance past the grace period (61s > 60s grace period)
		// -----------------------------------------------------------------------
		await advanceTime(61);

		// -----------------------------------------------------------------------
		// Step 5: Release escrow (escrows table only — Shipped → Released)
		// -----------------------------------------------------------------------
		const releaseResult = await releaseEscrow([`--order-id`, orderId]);
		expect(releaseResult.txHash).toBeTruthy();
		expect(typeof releaseResult.txHash).toBe('string');

		const finalEscrow = await getEscrowRow(orderId);
		expect(finalEscrow!.status).toBe('released');
		expect(finalEscrow!.release_tx_hash).toBeTruthy();

		// -----------------------------------------------------------------------
		// Step 6: Traceability — record the `completed` event on chain.
		//   This owns orders.status + order_events('completed').
		// -----------------------------------------------------------------------
		await markOrderCompleted([`--order-id`, orderId]);

		// -----------------------------------------------------------------------
		// Step 7: Verify final DB state
		// -----------------------------------------------------------------------
		const finalOrder = await getOrderRow(orderId);
		expect(finalOrder.status).toBe('completed');

		// 3 event rows: paid, shipped, completed
		const events = await getOrderEvents(orderId);
		expect(events).toHaveLength(3);
		const eventTypes = events.map(e => e.event_type);
		expect(eventTypes).toContain('paid');
		expect(eventTypes).toContain('shipped');
		expect(eventTypes).toContain('completed');

		// All tx hashes are non-empty
		for (const event of events) {
			expect(event.tx_hash).toBeTruthy();
			expect(event.tx_hash.length).toBeGreaterThan(0);
		}
	}, 180_000); // 3 minute timeout to accommodate real-time waits
});
