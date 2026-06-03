/**
 * Oracle-driven escrow settlement decision logic.
 *
 * This module is the keeper's brain. It encodes decisions 2, 3, and 5 of the
 * Milestone 3 design spec:
 *
 *   Decision 2 — IN_TRANSIT triggers mark_shipped (when escrow is still pending).
 *   Decision 3 — DELIVERED + grace window elapsed triggers release.
 *   Decision 5 — Refunds are buyer-initiated only; the keeper NEVER refunds.
 *
 * The function is intentionally PURE:
 *   - No DB or chain imports.
 *   - No `process.env` reads.
 *   - No internal clock reads — the caller passes `nowMs`.
 *
 * This makes it trivially unit-testable and safe to call from any context.
 *
 * ## Decision matrix
 *
 * | OracleStatus         | escrow.status | Condition                     | Action       |
 * |----------------------|---------------|-------------------------------|--------------|
 * | IN_TRANSIT           | pending       |                               | mark_shipped |
 * | IN_TRANSIT           | shipped       |                               | none         |
 * | DELIVERED            | pending       |                               | mark_shipped |
 * | DELIVERED            | shipped       | nowMs >= grace_period_end     | release      |
 * | DELIVERED            | shipped       | nowMs < grace_period_end      | none         |
 * | DELIVERED            | shipped       | grace_period_end === null     | none (safe)  |
 * | PRE_TRANSIT / NOT_DELIVERED / UNKNOWN | any  |                    | none         |
 * | any                  | released      |                               | none         |
 * | any                  | refunded      |                               | none         |
 */

import type { OracleStatus } from 'shipping-oracle-sdk';

/** The set of actions the keeper may take on a single escrow pass. */
export type EscrowAction = 'mark_shipped' | 'release' | 'none';

/**
 * The minimal escrow fields needed to reach a decision.
 *
 * Using `Pick` keeps the function signature narrow and ensures no accidental
 * coupling to DB-level fields like UTxO refs or tx hashes.
 */
export type EscrowDecisionInput = Pick<Database.Escrow, 'status' | 'grace_period_end'>;

/**
 * Decide what keeper action to take for a given escrow + oracle observation.
 *
 * @param escrow        - Narrow view of the escrow row (status + grace_period_end).
 * @param oracleStatus  - Current shipment status reported by the oracle.
 * @param nowMs         - Current wall-clock time in milliseconds (caller-provided;
 *                        function must not read its own clock).
 * @returns The action the keeper should perform, or `'none'` if no action is needed.
 */
export function decideEscrowAction(
	escrow: EscrowDecisionInput,
	oracleStatus: OracleStatus,
	nowMs: number,
): EscrowAction {
	// Terminal states — never act on a settled escrow.
	if (escrow.status === 'released' || escrow.status === 'refunded') {
		return 'none';
	}

	switch (oracleStatus) {
		case 'IN_TRANSIT': {
			// Mark shipped when the escrow hasn't been marked yet.
			// If already shipped, wait; we don't know the delivery state yet.
			return escrow.status === 'pending' ? 'mark_shipped' : 'none';
		}

		case 'DELIVERED': {
			if (escrow.status === 'pending') {
				// Saw delivery before any in-transit update; mark first.
				// Release will happen on the next keeper pass once status is 'shipped'.
				return 'mark_shipped';
			}

			// escrow.status === 'shipped' from here on.
			// Guard: grace_period_end must be a non-null parseable date.
			if (escrow.grace_period_end === null) {
				// Cannot prove the grace window has elapsed — do not release.
				return 'none';
			}

			const graceMs = new Date(escrow.grace_period_end).getTime();
			// NaN guard: if the date string is malformed, getTime() returns NaN.
			// NaN comparisons are always false, so `nowMs >= NaN` is false → returns none.
			return nowMs >= graceMs ? 'release' : 'none';
		}

		// Statuses that give no signal actionable by the keeper.
		case 'PRE_TRANSIT':
		case 'NOT_DELIVERED':
		case 'UNKNOWN':
			return 'none';
	}
}
