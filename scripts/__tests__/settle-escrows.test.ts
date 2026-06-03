/**
 * Tests for scripts/settle-escrows.ts — keeper loop unit tests.
 *
 * These tests cover `settleEscrows()` end-to-end using mocks for all I/O
 * boundaries: Supabase (DB scan), oracle client (injected stub), and the
 * delegated transition scripts (escrow-mark-shipped, escrow-release).
 *
 * `decideEscrowAction` is intentionally NOT mocked — it is a pure function
 * and the escrow rows drive it with realistic field values.
 *
 * Mocking conventions (repo style from escrow-mark-shipped.test.ts):
 *   - @supabase/supabase-js: vi.mock so createClient returns a stub whose
 *     .from('escrows').select(...).in(...) resolves to { data, error }.
 *   - Delegated scripts: vi.mock with paths relative to __tests__/.
 *   - Oracle client: plain stub object injected via opts.oracleClient — the
 *     SDK is NOT mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock
//
// The keeper does:
//   supabase.from('escrows').select('*, orders(carrier, tracking_number)').in('status', [...])
// Chain: from() → { select }, select() → { in }, in() → Promise<{ data, error }>
// ---------------------------------------------------------------------------

let mockRows: unknown[] = [];

const mockIn = vi.fn(() => Promise.resolve({ data: mockRows, error: null }));
const mockSelect = vi.fn(() => ({ in: mockIn }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({ from: mockFrom })),
}));

// ---------------------------------------------------------------------------
// Mock: delegated transition scripts
// Paths are relative to scripts/__tests__/
// ---------------------------------------------------------------------------

const mockMarkShippedMain = vi.fn().mockResolvedValue({ txHash: 'mocktx-mark', explorerUrl: undefined });
const mockReleaseMain = vi.fn().mockResolvedValue({ txHash: 'mocktx-release', explorerUrl: undefined });

vi.mock('../escrow-mark-shipped.js', () => ({ main: mockMarkShippedMain }));
vi.mock('../escrow-release.js', () => ({ main: mockReleaseMain }));

// Traceability scripts (orders.status + order_events) — synced by default.
const mockMarkOrderShippedMain = vi.fn().mockResolvedValue({ txHash: 'mocktx-order-shipped' });
const mockMarkOrderCompletedMain = vi.fn().mockResolvedValue({ txHash: 'mocktx-order-completed' });

vi.mock('../mark-order-shipped.js', () => ({ main: mockMarkOrderShippedMain }));
vi.mock('../mark-order-completed.js', () => ({ main: mockMarkOrderCompletedMain }));

// ---------------------------------------------------------------------------
// Import module under test (AFTER mocks are registered — vi.mock is hoisted)
// ---------------------------------------------------------------------------

import type { OracleClient } from 'shipping-oracle-sdk';
const { settleEscrows } = await import('../settle-escrows.js');

// ---------------------------------------------------------------------------
// Env setup
// ---------------------------------------------------------------------------

beforeEach(() => {
	process.env.VITE_SUPABASE_URL = 'http://localhost';
	process.env.SUPABASE_SECRET_KEY = 'test-key';
	mockRows = [];
	vi.clearAllMocks();
	// Re-assign the default resolved values after clearAllMocks resets them
	mockIn.mockImplementation(() => Promise.resolve({ data: mockRows, error: null }));
	mockSelect.mockReturnValue({ in: mockIn });
	mockFrom.mockReturnValue({ select: mockSelect });
	mockMarkShippedMain.mockResolvedValue({ txHash: 'mocktx-mark', explorerUrl: undefined });
	mockReleaseMain.mockResolvedValue({ txHash: 'mocktx-release', explorerUrl: undefined });
	mockMarkOrderShippedMain.mockResolvedValue({ txHash: 'mocktx-order-shipped' });
	mockMarkOrderCompletedMain.mockResolvedValue({ txHash: 'mocktx-order-completed' });
});

afterEach(() => {
	delete process.env.VITE_SUPABASE_URL;
	delete process.env.SUPABASE_SECRET_KEY;
});

// ---------------------------------------------------------------------------
// Row factory
// ---------------------------------------------------------------------------

interface RowOptions {
	orderId?: string;
	status?: Database.EscrowStatus;
	/** ISO string or undefined (omitted → null) */
	graceEnd?: string | null;
	/** ISO string — used to set ship_deadline */
	shipDeadline?: string;
	carrier?: string | null;
	tracking?: string | null;
}

function makeRow(opts: RowOptions = {}): Database.Escrow & {
	orders: { carrier: string | null; tracking_number: string | null } | null;
} {
	const {
		orderId = 'order-0000-0000-0000-000000000001',
		status = 'pending',
		graceEnd = null,
		shipDeadline = new Date(Date.now() + 86400 * 1000).toISOString(),
		carrier = 'FEDEX',
		tracking = 'TRACK123',
	} = opts;

	const escrow: Database.Escrow = {
		id: `esc-${orderId}`,
		order_id: orderId,
		script_address: 'addr_test1_script',
		utxo_tx_hash: 'aabbccdd00112233',
		utxo_output_index: 0,
		status,
		buyer_pkh: '00'.repeat(28),
		merchant_pkh: 'ff'.repeat(28),
		paid_at: new Date(Date.now() - 3600 * 1000).toISOString(),
		ship_deadline: shipDeadline,
		grace_period_end: graceEnd ?? null,
		datum_cbor: 'd87a80',
		shipped_tx_hash: null,
		release_tx_hash: null,
		refund_tx_hash: null,
		created_at: '2026-06-01T00:00:00Z',
		updated_at: '2026-06-01T00:00:00Z',
	};

	return {
		...escrow,
		orders:
			carrier !== undefined || tracking !== undefined
				? { carrier: carrier ?? null, tracking_number: tracking ?? null }
				: null,
	};
}

/** Build an oracle client stub that returns the given status for every call. */
function makeOracle(status: string): OracleClient {
	return {
		prepareCommitment: vi.fn().mockResolvedValue({
			context: 'order-0000-0000-0000-000000000001',
			attestation: { data: { status } },
		}),
	} as unknown as OracleClient;
}

// ---------------------------------------------------------------------------
// Test 1: No-tracking skip
// ---------------------------------------------------------------------------

describe('no-tracking skip', () => {
	it('skips a pending row with null carrier and tracking, marks skippedNoTracking', async () => {
		const row = makeRow({ carrier: null, tracking: null });
		mockRows = [row];

		const oracle = makeOracle('IN_TRANSIT');
		const summary = await settleEscrows({ oracleClient: oracle });

		expect(summary.skippedNoTracking).toBe(1);
		expect(summary.scanned).toBe(1);
		expect(summary.marked).toBe(0);
		expect(summary.released).toBe(0);
		expect(mockMarkShippedMain).not.toHaveBeenCalled();
		expect(mockReleaseMain).not.toHaveBeenCalled();
		expect((oracle.prepareCommitment as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Test 2: IN_TRANSIT + pending → mark_shipped
// ---------------------------------------------------------------------------

describe('IN_TRANSIT + pending → mark_shipped', () => {
	it('calls markShippedMain with the order id and tallies marked=1', async () => {
		const ORDER_ID = 'order-1111-1111-1111-111111111111';
		const row = makeRow({
			orderId: ORDER_ID,
			status: 'pending',
			shipDeadline: new Date(Date.now() + 86400 * 1000).toISOString(),
		});
		mockRows = [row];

		const oracle = makeOracle('IN_TRANSIT');
		const summary = await settleEscrows({ oracleClient: oracle });

		expect(mockMarkShippedMain).toHaveBeenCalledOnce();
		expect(mockMarkShippedMain).toHaveBeenCalledWith(['--order-id', ORDER_ID]);
		expect(summary.marked).toBe(1);
		expect(summary.released).toBe(0);
		expect(summary.errors).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Test 3: DELIVERED + shipped + grace elapsed → release
// ---------------------------------------------------------------------------

describe('DELIVERED + shipped + grace elapsed → release', () => {
	it('calls releaseMain with the order id and tallies released=1', async () => {
		const ORDER_ID = 'order-2222-2222-2222-222222222222';
		const pastGrace = new Date(Date.now() - 86400 * 1000).toISOString(); // yesterday
		const row = makeRow({
			orderId: ORDER_ID,
			status: 'shipped',
			graceEnd: pastGrace,
			shipDeadline: new Date(Date.now() + 86400 * 1000).toISOString(),
		});
		mockRows = [row];

		const oracle = makeOracle('DELIVERED');
		const summary = await settleEscrows({ oracleClient: oracle });

		expect(mockReleaseMain).toHaveBeenCalledOnce();
		expect(mockReleaseMain).toHaveBeenCalledWith(['--order-id', ORDER_ID]);
		expect(summary.released).toBe(1);
		expect(summary.marked).toBe(0);
		expect(summary.errors).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Test 4: DELIVERED + shipped + within grace → none
// ---------------------------------------------------------------------------

describe('DELIVERED + shipped + within grace → noop', () => {
	it('takes no action and tallies noop=1', async () => {
		const ORDER_ID = 'order-3333-3333-3333-333333333333';
		const futureGrace = new Date(Date.now() + 86400 * 7 * 1000).toISOString(); // 7 days from now
		const row = makeRow({
			orderId: ORDER_ID,
			status: 'shipped',
			graceEnd: futureGrace,
			shipDeadline: new Date(Date.now() + 86400 * 1000).toISOString(),
		});
		mockRows = [row];

		const oracle = makeOracle('DELIVERED');
		const summary = await settleEscrows({ oracleClient: oracle });

		expect(mockMarkShippedMain).not.toHaveBeenCalled();
		expect(mockReleaseMain).not.toHaveBeenCalled();
		expect(summary.noop).toBe(1);
		expect(summary.errors).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Test 5: Dry-run — tallies but does NOT call delegates
// ---------------------------------------------------------------------------

describe('dry-run', () => {
	it('increments marked without calling markShippedMain', async () => {
		const ORDER_ID = 'order-4444-4444-4444-444444444444';
		const row = makeRow({
			orderId: ORDER_ID,
			status: 'pending',
			shipDeadline: new Date(Date.now() + 86400 * 1000).toISOString(),
		});
		mockRows = [row];

		const oracle = makeOracle('IN_TRANSIT');
		const summary = await settleEscrows({ oracleClient: oracle, dryRun: true });

		expect(mockMarkShippedMain).not.toHaveBeenCalled();
		expect(mockReleaseMain).not.toHaveBeenCalled();
		expect(summary.marked).toBe(1);
		expect(summary.errors).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Test 6: Per-escrow error isolation
// ---------------------------------------------------------------------------

describe('per-escrow error isolation', () => {
	it('continues processing after the first escrow fails, errors=1 and marked=1', async () => {
		const ORDER_A = 'order-5555-5555-5555-555555555555';
		const ORDER_B = 'order-6666-6666-6666-666666666666';
		const rowA = makeRow({
			orderId: ORDER_A,
			status: 'pending',
			shipDeadline: new Date(Date.now() + 86400 * 1000).toISOString(),
		});
		const rowB = makeRow({
			orderId: ORDER_B,
			status: 'pending',
			shipDeadline: new Date(Date.now() + 86400 * 1000).toISOString(),
		});
		mockRows = [rowA, rowB];

		const oracle: OracleClient = {
			prepareCommitment: vi
				.fn()
				.mockRejectedValueOnce(new Error('INVALID_SIGNATURE'))
				.mockResolvedValueOnce({
					context: ORDER_B,
					attestation: { data: { status: 'IN_TRANSIT' } },
				}),
		} as unknown as OracleClient;

		const summary = await settleEscrows({ oracleClient: oracle });

		expect(summary.errors).toBe(1);
		expect(summary.marked).toBe(1);
		expect(mockMarkShippedMain).toHaveBeenCalledOnce();
		expect(mockMarkShippedMain).toHaveBeenCalledWith(['--order-id', ORDER_B]);
	});
});

// ---------------------------------------------------------------------------
// Test 7: SHIP_DEADLINE_EXCEEDED → refundEligible (not errors)
// ---------------------------------------------------------------------------

describe('SHIP_DEADLINE_EXCEEDED → refundEligible, not errors', () => {
	it('counts refundEligible=1 and errors=0 when markShippedMain throws SHIP_DEADLINE_EXCEEDED', async () => {
		const ORDER_ID = 'order-7777-7777-7777-777777777777';
		// ship_deadline is in the FUTURE — so step 2a does NOT pre-count refundEligible
		const row = makeRow({
			orderId: ORDER_ID,
			status: 'pending',
			shipDeadline: new Date(Date.now() + 86400 * 1000).toISOString(),
		});
		mockRows = [row];

		const oracle = makeOracle('IN_TRANSIT');
		mockMarkShippedMain.mockRejectedValueOnce(
			new Error('SHIP_DEADLINE_EXCEEDED: deadline has passed'),
		);

		const summary = await settleEscrows({ oracleClient: oracle });

		expect(summary.errors).toBe(0);
		expect(summary.refundEligible).toBe(1);
		expect(summary.marked).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Test 8 (optional): Empty scan
// ---------------------------------------------------------------------------

describe('empty scan', () => {
	it('returns all-zero summary when no rows are returned', async () => {
		mockRows = [];
		const oracle = makeOracle('IN_TRANSIT');
		const summary = await settleEscrows({ oracleClient: oracle });

		expect(summary.scanned).toBe(0);
		expect(summary.skippedNoTracking).toBe(0);
		expect(summary.marked).toBe(0);
		expect(summary.released).toBe(0);
		expect(summary.noop).toBe(0);
		expect(summary.errors).toBe(0);
		expect(summary.refundEligible).toBe(0);
		expect(summary.traced).toBe(0);
		expect(summary.traceErrors).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Test 9: Traceability sync (default ON; mark→mark-order-shipped, release→completed)
// ---------------------------------------------------------------------------

describe('traceability sync', () => {
	it('runs mark-order-shipped (with tracking) after a successful mark, traced=1', async () => {
		const ORDER_ID = 'order-8888-8888-8888-888888888888';
		mockRows = [makeRow({ orderId: ORDER_ID, status: 'pending', carrier: 'FEDEX', tracking: 'TRACK-XYZ' })];

		const summary = await settleEscrows({ oracleClient: makeOracle('IN_TRANSIT') });

		expect(mockMarkOrderShippedMain).toHaveBeenCalledWith(['--order-id', ORDER_ID, '--tracking', 'TRACK-XYZ']);
		expect(summary.traced).toBe(1);
		expect(summary.traceErrors).toBe(0);
	});

	it('runs mark-order-completed after a successful release, traced=1', async () => {
		const ORDER_ID = 'order-9999-9999-9999-999999999999';
		const pastGrace = new Date(Date.now() - 86400 * 1000).toISOString();
		mockRows = [makeRow({ orderId: ORDER_ID, status: 'shipped', graceEnd: pastGrace })];

		const summary = await settleEscrows({ oracleClient: makeOracle('DELIVERED') });

		expect(mockMarkOrderCompletedMain).toHaveBeenCalledWith(['--order-id', ORDER_ID]);
		expect(summary.traced).toBe(1);
	});

	it('does NOT run traceability when traceability:false', async () => {
		mockRows = [makeRow({ status: 'pending' })];

		const summary = await settleEscrows({ oracleClient: makeOracle('IN_TRANSIT'), traceability: false });

		expect(mockMarkOrderShippedMain).not.toHaveBeenCalled();
		expect(summary.marked).toBe(1);
		expect(summary.traced).toBe(0);
	});

	it('does NOT run traceability in dry-run', async () => {
		mockRows = [makeRow({ status: 'pending' })];

		await settleEscrows({ oracleClient: makeOracle('IN_TRANSIT'), dryRun: true });

		expect(mockMarkOrderShippedMain).not.toHaveBeenCalled();
	});

	it('isolates a traceability failure: escrow still marked, traceErrors=1, errors=0', async () => {
		mockRows = [makeRow({ status: 'pending' })];
		mockMarkOrderShippedMain.mockRejectedValueOnce(new Error('INVALID_TRANSITION'));

		const summary = await settleEscrows({ oracleClient: makeOracle('IN_TRANSIT') });

		expect(summary.marked).toBe(1);
		expect(summary.errors).toBe(0);
		expect(summary.traceErrors).toBe(1);
		expect(summary.traced).toBe(0);
	});
});
