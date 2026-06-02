/**
 * E2E: escrow_oracle_refund_blocked
 *
 * Scenario: keeper transitions escrow to Shipped; buyer refund is then blocked.
 *   1. Lock fixture (carrier=fedex, trackingNumber=E2E-ORACLE-REFUND).
 *   2. Run keeper with IN_TRANSIT oracle → escrow transitions Pending → Shipped.
 *   3. Buyer attempts to refund → must throw INVALID_STATE.
 *   4. Assert escrow.status is still 'shipped'.
 *
 * Mirrors escrow_refund_after_shipped_fails.e2e.ts (direct mark-shipped call)
 * but triggers the Shipped state via the keeper oracle path instead.
 *
 * Requires:
 *   - Running dolos node (TX3_TRP_ENDPOINT, TX3_PROFILE)
 *   - Funded merchant address + skey (MERCHANT_ADDRESS, MERCHANT_SKEY)
 *   - Funded buyer address + skey (TEST_BUYER_ADDRESS, TEST_BUYER_SKEY)
 *   - Supabase credentials (VITE_SUPABASE_URL, SUPABASE_SECRET_KEY)
 *   - ESCROW_SHIP_DEADLINE_SECONDS=60 + ESCROW_GRACE_PERIOD_SECONDS=60
 *   - E2E_LOCK_TX_HASH — a pre-funded lock tx hash on the devnet
 *
 * Skip: automatically when any required env var is missing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { main as refundEscrow } from '../../scripts/escrow-refund.js';
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
	`escrow_oracle_refund_blocked.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`,
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
			'rejects buyer refund when keeper has already transitioned escrow to shipped',
			async () => {
				// -------------------------------------------------------------------
				// Step 1: Simulate buyer lock tx with tracking info.
				// -------------------------------------------------------------------
				const lockTxHash =
					process.env.E2E_LOCK_TX_HASH ??
					'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

				const buyerKey = process.env.TEST_BUYER_SKEY;
				if (!buyerKey) throw new Error('E2E: TEST_BUYER_SKEY is required');

				await insertLockPaymentFixture({
					orderId,
					lockTxHash,
					lockOutputIndex: 0,
					carrier: 'fedex',
					trackingNumber: 'E2E-ORACLE-REFUND',
				});

				// -------------------------------------------------------------------
				// Step 2: Run keeper with IN_TRANSIT oracle → Pending → Shipped.
				// -------------------------------------------------------------------
				await settleEscrows({ oracleClient: makeStubOracleClient('IN_TRANSIT') });

				const shippedEscrow = await getEscrowRow(orderId);
				expect(shippedEscrow).not.toBeNull();
				expect(shippedEscrow!.status).toBe('shipped');

				// -------------------------------------------------------------------
				// Step 3: Buyer attempts refund — must be rejected (INVALID_STATE).
				// The escrow-refund script pre-checks: status must be 'pending'.
				// Once the keeper has marked it shipped, the buyer cannot refund.
				// -------------------------------------------------------------------
				await expect(
					refundEscrow([`--order-id`, orderId, `--buyer-key`, buyerKey]),
				).rejects.toThrow('INVALID_STATE');

				// -------------------------------------------------------------------
				// Step 4: Escrow must remain in 'shipped' state — unchanged.
				// -------------------------------------------------------------------
				const unchangedEscrow = await getEscrowRow(orderId);
				expect(unchangedEscrow!.status).toBe('shipped');
			},
			120_000, // 2-minute timeout
		);
	},
);
