/**
 * E2E: escrow_oracle_no_tracking
 *
 * Scenario: keeper skips escrows whose order has no tracking information.
 *   1. Lock fixture WITHOUT carrier or trackingNumber (both stay null on orders).
 *   2. Run keeper with any oracle stub.
 *   3. Assert escrow is untouched (status = 'pending').
 *   4. Assert summary.skippedNoTracking >= 1.
 *
 * This test is DOLOS-INDEPENDENT for its core assertion: because the keeper
 * skips the escrow BEFORE any oracle or chain call (carrier is null), it
 * does NOT need a real lock UTxO on dolos. It still requires a real Supabase
 * connection to create/read the order + escrow rows.
 *
 * NOTE: This suite IS wrapped in skipIf(SKIP) because Supabase env is still
 * needed for createTestOrder / insertLockPaymentFixture / getEscrowRow.
 * The keeper's skip-before-oracle logic is validated by getEscrowRow returning
 * 'pending' and the returned summary.skippedNoTracking count.
 *
 * Requires:
 *   - Supabase credentials (VITE_SUPABASE_URL, SUPABASE_SECRET_KEY)
 *   - TX3_TRP_ENDPOINT, MERCHANT_ADDRESS, MERCHANT_SKEY,
 *     TEST_BUYER_ADDRESS, TEST_BUYER_SKEY (all in REQUIRED_E2E_VARS)
 *
 * Skip: automatically when any required env var is missing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { settleEscrows } from '../../scripts/settle-escrows.js';
import {
	cleanupOrder,
	createTestOrder,
	getEscrowRow,
	insertLockPaymentFixture,
	isE2eConfigured,
	missingE2eVars,
} from './_fixtures/dolos.js';
import { makeStubOracleClient } from './_fixtures/oracle.js';

// ---------------------------------------------------------------------------
// Skip guard — tests are skipped if the e2e environment is not configured.
// ---------------------------------------------------------------------------

const SKIP = !isE2eConfigured();
const SKIP_REASON = SKIP ? `Missing env vars: ${missingE2eVars().join(', ')}` : '';

describe.skipIf(SKIP)(
	`escrow_oracle_no_tracking.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`,
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

		it(
			'keeper skips escrow when order has no carrier/tracking_number and leaves it pending',
			async () => {
				// -------------------------------------------------------------------
				// Step 1: Lock fixture WITHOUT tracking (carrier + trackingNumber omitted).
				// The orders row will have carrier=null, tracking_number=null.
				// -------------------------------------------------------------------
				const lockTxHash =
					process.env.E2E_LOCK_TX_HASH ??
					'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

				await insertLockPaymentFixture({
					orderId,
					lockTxHash,
					lockOutputIndex: 0,
					// carrier and trackingNumber intentionally omitted
				});

				const initialEscrow = await getEscrowRow(orderId);
				expect(initialEscrow).not.toBeNull();
				expect(initialEscrow!.status).toBe('pending');

				// -------------------------------------------------------------------
				// Step 2: Run keeper. The keeper finds carrier=null → skips BEFORE
				// any oracle query or chain call. Uses DELIVERED stub, but it will
				// never be reached for this escrow.
				// -------------------------------------------------------------------
				const summary = await settleEscrows({
					oracleClient: makeStubOracleClient('DELIVERED'),
				});

				// -------------------------------------------------------------------
				// Step 3: Escrow must be untouched — still 'pending'.
				// -------------------------------------------------------------------
				const escrowAfter = await getEscrowRow(orderId);
				expect(escrowAfter).not.toBeNull();
				expect(escrowAfter!.status).toBe('pending');

				// -------------------------------------------------------------------
				// Step 4: Summary must report at least one skipped-no-tracking escrow.
				// (There may be other escrows in the DB from parallel runs, so >= 1.)
				// -------------------------------------------------------------------
				expect(summary.skippedNoTracking).toBeGreaterThanOrEqual(1);
			},
			60_000, // 1-minute timeout
		);
	},
);
