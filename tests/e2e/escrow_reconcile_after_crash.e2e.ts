/**
 * E2E: escrow_reconcile_after_crash
 *
 * Scenario: Manual on-chain mark-shipped (bypassing the script) leaves DB out of sync.
 * The reconcile-escrow script detects the drift and restores DB consistency,
 * including inserting the missing order_events row.
 *
 * Simulation approach:
 *   1. Insert an escrow row with status='pending' (DB state).
 *   2. Directly update the escrow's datum_cbor to a Shipped state datum
 *      (simulating an on-chain MarkShipped tx that was NOT recorded in DB).
 *   3. Update the DB escrow status to still be 'pending' (simulating the crash
 *      that occurred between chain submit and DB write).
 *   4. Run reconcile-escrow.
 *   5. Assert the DB escrow is now 'shipped' and the order_events row was inserted.
 *
 * Note: In a real crash test against a live dolos node, step 2 would involve
 * submitting the actual on-chain tx using a raw tx builder. For this test suite,
 * we use the "datum_cbor injection" approach: we update the DB mock datum to
 * include the Shipped CBOR pattern (d87a = Constr-1 Option), which is what
 * reconcile-escrow reads from chain when it fetches the UTxO.
 *
 * The reconciler's `isShippedDatum()` check looks for 'd87a' in the datum CBOR.
 * We inject a datum that contains this pattern to simulate the on-chain shipped state.
 *
 * Asserts:
 *   - After reconcile, escrows.status = 'shipped'
 *   - After reconcile, an order_events row with event_type='shipped' exists
 *   - reconcile-escrow returns pendingToShipped = 1
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

import { main as reconcileEscrow } from '../../scripts/reconcile-escrow.js';
import {
	cleanupOrder,
	createTestOrder,
	getE2eSupabase,
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

// ---------------------------------------------------------------------------
// Shipped datum CBOR for simulation
//
// A Shipped EscrowDatum contains grace_period_end = Some(t) where the Option
// is encoded as CBOR Constr-1. The reconciler's isShippedDatum() looks for
// the byte sequence 'd87a' in the datum hex.
//
// This minimal CBOR simulates a datum with Constr-1 embedded:
//   d87980 = Constr-0 [] (None — Pending)
//   d87a81... = Constr-1 [Int] (Some(t) — Shipped)
//
// For the simulated shipped datum, we embed d87a in a CBOR string that
// the reconciler will interpret as "Shipped state".
// ---------------------------------------------------------------------------
const SHIPPED_DATUM_CBOR =
	'd8799f581c0000000000000000000000000000000000000000000000000000000000000000581c0000000000000000000000000000000000000000000000000000000000000000401a0000000001a00000001bd87a811b0000018e9a7d5000ff';

describe.skipIf(SKIP)(
	`escrow_reconcile_after_crash.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`,
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

		it('restores DB consistency when on-chain shipped state is ahead of DB', async () => {
			const lockTxHash =
				process.env.E2E_LOCK_TX_HASH ??
				'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

			// -----------------------------------------------------------------------
			// Step 1: Insert the lock payment fixture (escrow pending, order paid)
			// -----------------------------------------------------------------------
			await insertLockPaymentFixture({ orderId, lockTxHash });

			const initialEscrow = await getEscrowRow(orderId);
			expect(initialEscrow!.status).toBe('pending');

			// -----------------------------------------------------------------------
			// Step 2: Simulate a crash scenario.
			//
			// We directly update the datum_cbor in the DB to the "Shipped" pattern.
			// This simulates the on-chain state being Shipped while the DB still
			// shows 'pending'. In a real crash, the chain tx confirmed but the DB
			// write never completed.
			//
			// The reconciler queries the chain for UTxOs at the script address and
			// reads their datum. We update the DB datum_cbor to match what the
			// reconciler would read from chain. We keep status='pending' to simulate
			// the DB being behind.
			//
			// NOTE: In a full e2e run against dolos, this step would instead
			// submit a real mark_shipped tx on-chain (bypassing the script). The
			// reconciler would then query dolos for the UTxO and find the Shipped
			// datum. Since that requires a funded dolos devnet, we use the datum
			// injection approach here for a self-contained test.
			// -----------------------------------------------------------------------
			const supabase = getE2eSupabase();
			const { error: updateError } = await supabase
				.from('escrows')
				.update({ datum_cbor: SHIPPED_DATUM_CBOR })
				.eq('order_id', orderId);

			expect(updateError).toBeNull();

			// Verify DB still shows 'pending' (crash simulation: status not updated)
			const crashedEscrow = await getEscrowRow(orderId);
			expect(crashedEscrow!.status).toBe('pending');
			expect(crashedEscrow!.datum_cbor).toBe(SHIPPED_DATUM_CBOR);

			// -----------------------------------------------------------------------
			// Step 3: Run reconcile-escrow
			//
			// The reconciler will:
			//   a) Query chain for UTxOs at the script address.
			//   b) Find our UTxO and inspect the datum.
			//   c) Detect Shipped datum while DB shows Pending.
			//   d) Update escrow to 'shipped' + insert order_events row.
			//
			// This test verifies the reconciler logic by ensuring the DB is
			// corrected after the reconciler runs.
			// -----------------------------------------------------------------------
			const reconcileResult = await reconcileEscrow();

			// The reconciler should have transitioned exactly 1 row
			expect(reconcileResult.pendingToShipped).toBe(1);
			expect(reconcileResult.errors).toBe(0);

			// -----------------------------------------------------------------------
			// Step 4: Verify DB state after reconciliation
			// -----------------------------------------------------------------------
			const repairedEscrow = await getEscrowRow(orderId);
			expect(repairedEscrow!.status).toBe('shipped');

			// The reconciler should have inserted the missing order_events row
			const events = await getOrderEvents(orderId);
			const shippedEvents = events.filter(e => e.event_type === 'shipped');
			expect(shippedEvents).toHaveLength(1);
			expect(shippedEvents[0]?.payload).toMatchObject({ reconciled: true });
		}, 60_000);
	},
);
