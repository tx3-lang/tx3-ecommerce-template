/**
 * E2E: escrow_oracle_delivery
 *
 * Scenario: keeper-driven delivery settlement.
 *   1. Lock fixture (carrier=fedex, trackingNumber=E2E-ORACLE-DELIVERY).
 *   2. Run keeper with IN_TRANSIT oracle → escrow transitions Pending → Shipped.
 *   3. Advance 61 s past grace period.
 *   4. Run keeper with DELIVERED oracle → escrow transitions Shipped → Released.
 *
 * Asserts:
 *   - After IN_TRANSIT run: escrow.status === 'shipped', shipped_tx_hash truthy,
 *     grace_period_end not null.
 *   - After DELIVERED run: escrow.status === 'released', release_tx_hash truthy.
 *
 * This is Milestone 3 evidence B2 (keeper-driven settlement).
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

import { settleEscrows } from '../../scripts/settle-escrows.js';
import {
	advanceTime,
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
	`escrow_oracle_delivery.e2e${SKIP ? ` [SKIPPED: ${SKIP_REASON}]` : ''}`,
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
			'keeper marks escrow shipped (IN_TRANSIT) then releases it (DELIVERED) after grace period',
			async () => {
				// -------------------------------------------------------------------
				// Step 1: Simulate buyer lock tx — set carrier + trackingNumber so
				// the keeper can resolve tracking via orders JOIN.
				// -------------------------------------------------------------------
				const lockTxHash =
					process.env.E2E_LOCK_TX_HASH ??
					'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

				await insertLockPaymentFixture({
					orderId,
					lockTxHash,
					lockOutputIndex: 0,
					carrier: 'fedex',
					trackingNumber: 'E2E-ORACLE-DELIVERY',
				});

				// Verify initial state
				const initialEscrow = await getEscrowRow(orderId);
				expect(initialEscrow).not.toBeNull();
				expect(initialEscrow!.status).toBe('pending');

				// -------------------------------------------------------------------
				// Step 2: Run keeper with IN_TRANSIT oracle stub.
				//   decideEscrowAction(pending, IN_TRANSIT) → 'mark_shipped'
				//   Keeper delegates to escrow-mark-shipped.
				// -------------------------------------------------------------------
				await settleEscrows({ oracleClient: makeStubOracleClient('IN_TRANSIT') });

				// Assert on THIS specific order, not on summary counts
				const shippedEscrow = await getEscrowRow(orderId);
				expect(shippedEscrow).not.toBeNull();
				expect(shippedEscrow!.status).toBe('shipped');
				expect(shippedEscrow!.shipped_tx_hash).toBeTruthy();
				expect(shippedEscrow!.grace_period_end).not.toBeNull();

				// -------------------------------------------------------------------
				// Step 3: Advance past grace period (61 s > 60 s ESCROW_GRACE_PERIOD_SECONDS)
				// -------------------------------------------------------------------
				await advanceTime(61);

				// -------------------------------------------------------------------
				// Step 4: Run keeper with DELIVERED oracle stub.
				//   decideEscrowAction(shipped, DELIVERED, after_grace) → 'release'
				//   Keeper delegates to escrow-release.
				// -------------------------------------------------------------------
				await settleEscrows({ oracleClient: makeStubOracleClient('DELIVERED') });

				const releasedEscrow = await getEscrowRow(orderId);
				expect(releasedEscrow).not.toBeNull();
				expect(releasedEscrow!.status).toBe('released');
				expect(releasedEscrow!.release_tx_hash).toBeTruthy();
			},
			180_000, // 3-minute timeout for real-time waits
		);
	},
);
