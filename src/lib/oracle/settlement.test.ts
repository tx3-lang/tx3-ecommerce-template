import { describe, expect, it } from 'vitest';
import type { EscrowDecisionInput } from './settlement.js';
import { decideEscrowAction } from './settlement.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** An ISO timestamp 1 hour in the past relative to nowMs. */
const GRACE_PAST = '2026-06-02T11:00:00Z'; // elapsed
/** An ISO timestamp 1 hour in the future relative to nowMs. */
const GRACE_FUTURE = '2026-06-02T13:00:00Z'; // pending

/** Reference "now" used throughout — 2026-06-02T12:00:00Z */
const NOW_MS = Date.parse('2026-06-02T12:00:00Z');

// Sanity-check our fixtures so tests don't silently use bad timestamps:
// Date.parse('2026-06-02T11:00:00Z') < NOW_MS < Date.parse('2026-06-02T13:00:00Z')

function escrow(status: Database.EscrowStatus, grace_period_end: string | null = null): EscrowDecisionInput {
	return { status, grace_period_end };
}

// ---------------------------------------------------------------------------
// IN_TRANSIT
// ---------------------------------------------------------------------------

describe('IN_TRANSIT oracle status', () => {
	it('pending escrow → mark_shipped', () => {
		expect(decideEscrowAction(escrow('pending'), 'IN_TRANSIT', NOW_MS)).toBe('mark_shipped');
	});

	it('shipped escrow → none (already shipped; wait for delivery)', () => {
		expect(decideEscrowAction(escrow('shipped', GRACE_FUTURE), 'IN_TRANSIT', NOW_MS)).toBe('none');
	});

	it('released escrow → none (terminal state)', () => {
		expect(decideEscrowAction(escrow('released'), 'IN_TRANSIT', NOW_MS)).toBe('none');
	});

	it('refunded escrow → none (terminal state)', () => {
		expect(decideEscrowAction(escrow('refunded'), 'IN_TRANSIT', NOW_MS)).toBe('none');
	});
});

// ---------------------------------------------------------------------------
// DELIVERED
// ---------------------------------------------------------------------------

describe('DELIVERED oracle status', () => {
	it('pending escrow → mark_shipped (saw delivery before in-transit; mark first)', () => {
		expect(decideEscrowAction(escrow('pending'), 'DELIVERED', NOW_MS)).toBe('mark_shipped');
	});

	it('shipped escrow with nowMs >= grace_period_end → release', () => {
		expect(decideEscrowAction(escrow('shipped', GRACE_PAST), 'DELIVERED', NOW_MS)).toBe('release');
	});

	it('shipped escrow with nowMs === grace_period_end exactly → release (boundary: equal means elapsed)', () => {
		const graceExact = new Date(NOW_MS).toISOString();
		expect(decideEscrowAction(escrow('shipped', graceExact), 'DELIVERED', NOW_MS)).toBe('release');
	});

	it('shipped escrow with nowMs < grace_period_end → none (still inside grace window)', () => {
		expect(decideEscrowAction(escrow('shipped', GRACE_FUTURE), 'DELIVERED', NOW_MS)).toBe('none');
	});

	it('shipped escrow with grace_period_end === null → none (safety: cannot prove grace elapsed)', () => {
		expect(decideEscrowAction(escrow('shipped', null), 'DELIVERED', NOW_MS)).toBe('none');
	});

	it('released escrow → none (terminal state)', () => {
		expect(decideEscrowAction(escrow('released'), 'DELIVERED', NOW_MS)).toBe('none');
	});

	it('refunded escrow → none (terminal state)', () => {
		expect(decideEscrowAction(escrow('refunded'), 'DELIVERED', NOW_MS)).toBe('none');
	});
});

// ---------------------------------------------------------------------------
// PRE_TRANSIT
// ---------------------------------------------------------------------------

describe('PRE_TRANSIT oracle status', () => {
	it('pending escrow → none', () => {
		expect(decideEscrowAction(escrow('pending'), 'PRE_TRANSIT', NOW_MS)).toBe('none');
	});

	it('shipped escrow → none', () => {
		expect(decideEscrowAction(escrow('shipped', GRACE_FUTURE), 'PRE_TRANSIT', NOW_MS)).toBe('none');
	});
});

// ---------------------------------------------------------------------------
// NOT_DELIVERED
// ---------------------------------------------------------------------------

describe('NOT_DELIVERED oracle status', () => {
	it('pending escrow → none', () => {
		expect(decideEscrowAction(escrow('pending'), 'NOT_DELIVERED', NOW_MS)).toBe('none');
	});

	it('shipped escrow → none', () => {
		expect(decideEscrowAction(escrow('shipped', GRACE_FUTURE), 'NOT_DELIVERED', NOW_MS)).toBe('none');
	});
});

// ---------------------------------------------------------------------------
// UNKNOWN
// ---------------------------------------------------------------------------

describe('UNKNOWN oracle status', () => {
	it('pending escrow → none', () => {
		expect(decideEscrowAction(escrow('pending'), 'UNKNOWN', NOW_MS)).toBe('none');
	});

	it('shipped escrow → none', () => {
		expect(decideEscrowAction(escrow('shipped', GRACE_FUTURE), 'UNKNOWN', NOW_MS)).toBe('none');
	});
});

// ---------------------------------------------------------------------------
// Terminal states — all oracle statuses must be no-ops
// ---------------------------------------------------------------------------

describe('terminal escrow states (released, refunded)', () => {
	const terminalStatuses: Database.EscrowStatus[] = ['released', 'refunded'];
	const oracleStatuses = ['DELIVERED', 'IN_TRANSIT', 'PRE_TRANSIT', 'NOT_DELIVERED', 'UNKNOWN'] as const;

	for (const escrowStatus of terminalStatuses) {
		for (const oracleStatus of oracleStatuses) {
			it(`${oracleStatus} + ${escrowStatus} → none`, () => {
				expect(decideEscrowAction(escrow(escrowStatus), oracleStatus, NOW_MS)).toBe('none');
			});
		}
	}
});

// ---------------------------------------------------------------------------
// Safety: the function NEVER returns 'refund'
// ---------------------------------------------------------------------------

describe('return type safety — no refund action', () => {
	const allOracleStatuses = ['DELIVERED', 'IN_TRANSIT', 'PRE_TRANSIT', 'NOT_DELIVERED', 'UNKNOWN'] as const;
	const allEscrowStatuses: Database.EscrowStatus[] = ['pending', 'shipped', 'released', 'refunded'];

	for (const oracleStatus of allOracleStatuses) {
		for (const escrowStatus of allEscrowStatuses) {
			it(`${oracleStatus} + ${escrowStatus} never returns 'refund'`, () => {
				const result = decideEscrowAction(escrow(escrowStatus, GRACE_PAST), oracleStatus, NOW_MS);
				expect(result).not.toBe('refund');
			});
		}
	}
});
