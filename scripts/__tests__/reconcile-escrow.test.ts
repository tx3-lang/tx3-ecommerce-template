/**
 * Tests for scripts/reconcile-escrow.ts
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js              — Supabase client (escrows SELECT + UPDATE)
 *   - @/lib/cardano/u5c-client           — createU5cClient / checkStatus / getUtxosByAddress
 *   - @/lib/cardano/network              — getNetworkConfig
 *   - @/server-fns/order-events          — insertOrderEvent
 *
 * Chain query approach:
 *   The u5c client is extended with getUtxosByAddress() for UTxO lookups.
 *   Tests mock this method to simulate:
 *     (a) UTxO still at script address with Pending datum → in sync, skip
 *     (b) UTxO at script address with Shipped datum (grace_period_end set) → update to Shipped
 *     (c) UTxO consumed (not in set) — spending tx outputs to merchant → Released
 *     (d) UTxO consumed (not in set) — spending tx outputs to buyer → Refunded
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock
// Reads: supabase.from('escrows').select('*').not('status', 'in', ...)
// Updates: supabase.from('escrows').update({...}).eq('order_id', ...)
// ---------------------------------------------------------------------------

const mockEq = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockNot = vi.fn();
const mockSelect = vi.fn(() => ({ not: mockNot }));
const mockFrom = vi.fn((_table: string) => ({ select: mockSelect, update: mockUpdate }));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({ from: mockFrom })),
}));

// ---------------------------------------------------------------------------
// Mock: createU5cClient — extended with getUtxosByAddress and getSpendingTx
// ---------------------------------------------------------------------------
const mockCheckStatus = vi.fn();
const mockGetUtxosByAddress = vi.fn();
const mockGetSpendingTx = vi.fn();
const mockCreateU5cClient = vi.fn(() => ({
	checkStatus: mockCheckStatus,
	getUtxosByAddress: mockGetUtxosByAddress,
	getSpendingTx: mockGetSpendingTx,
}));

vi.mock('@/lib/cardano/u5c-client', () => ({
	createU5cClient: mockCreateU5cClient,
	ChainUnavailable: class ChainUnavailable extends Error {
		cause: unknown;
		constructor(message: string, cause: unknown) {
			super(message);
			this.name = 'ChainUnavailable';
			this.cause = cause;
		}
	},
}));

// ---------------------------------------------------------------------------
// Mock: getNetworkConfig
// ---------------------------------------------------------------------------
const mockGetNetworkConfig = vi.fn();

vi.mock('@/lib/cardano/network', () => ({
	getNetworkConfig: mockGetNetworkConfig,
}));

// ---------------------------------------------------------------------------
// Mock: insertOrderEvent
// ---------------------------------------------------------------------------
const mockInsertOrderEvent = vi.fn();

vi.mock('@/server-fns/order-events', () => ({
	insertOrderEvent: mockInsertOrderEvent,
	listOrderEvents: vi.fn(),
	markEventConfirmed: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Env setup (service-role Supabase client)
// ---------------------------------------------------------------------------
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'service-role-secret';

// ---------------------------------------------------------------------------
// Import module under test (AFTER mocks are registered — vi.mock is hoisted)
// ---------------------------------------------------------------------------
const { main } = await import('../reconcile-escrow.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const STUB_CONFIG = {
	trpEndpoint: 'https://preview.trp.example.com',
	profile: 'preview' as const,
	metadataLabel: 1337,
	merchantAddress: 'addr1qtest_merchant',
};

const SCRIPT_ADDRESS = 'addr1qscript_escrow';

// A pending escrow row — UTxO at script address, no grace_period_end in datum
const ESCROW_PENDING: Database.Escrow = {
	id: 'esc-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	order_id: 'ord-1111',
	script_address: SCRIPT_ADDRESS,
	utxo_tx_hash: 'tx_pending_utxo',
	utxo_output_index: 0,
	status: 'pending',
	buyer_pkh: 'buyer_pkh_001',
	merchant_pkh: 'merchant_pkh_001',
	paid_at: '2026-05-22T10:00:00Z',
	ship_deadline: '2026-05-29T10:00:00Z',
	grace_period_end: null,
	datum_cbor: 'd87980', // CBOR encoding of OptionInt::None (tag 121 / constr 0)
	shipped_tx_hash: null,
	release_tx_hash: null,
	refund_tx_hash: null,
	created_at: '2026-05-22T10:00:00Z',
	updated_at: '2026-05-22T10:00:00Z',
};

// A pending escrow row that is now Shipped on-chain (grace_period_end in datum)
// datum_cbor represents OptionInt::Some { value: 1748952000000 } — constr 1 with an int
// In CBOR this would be: tag 122 [1748952000000] — using a real-ish hex placeholder
const ESCROW_PENDING_NOW_SHIPPED: Database.Escrow = {
	...ESCROW_PENDING,
	id: 'esc-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	order_id: 'ord-2222',
	utxo_tx_hash: 'tx_shipped_utxo',
	utxo_output_index: 1,
	datum_cbor: 'd87980', // DB still has old pending datum — chain has Shipped
};

// A shipped escrow row — UTxO consumed, releasing to merchant
const ESCROW_SHIPPED: Database.Escrow = {
	...ESCROW_PENDING,
	id: 'esc-cccc-cccc-cccc-cccccccccccc',
	order_id: 'ord-3333',
	status: 'shipped',
	utxo_tx_hash: 'tx_shipped_utxo_2',
	utxo_output_index: 0,
	shipped_tx_hash: 'tx_shipped_hash_2',
	grace_period_end: '2026-05-30T10:00:00Z',
	datum_cbor: 'd8797a01b0000000000000', // Shipped datum (Some value)
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetNetworkConfig.mockReturnValue(STUB_CONFIG);
	mockEq.mockResolvedValue({ error: null });
	mockInsertOrderEvent.mockResolvedValue({ id: 'event-new' });
});

// ---------------------------------------------------------------------------
// Empty result — no non-terminal escrows
// ---------------------------------------------------------------------------
describe('no non-terminal escrows', () => {
	it('returns zero transitions when table returns empty rows', async () => {
		mockNot.mockResolvedValueOnce({ data: [], error: null });

		const result = await main();

		expect(result.pendingToShipped).toBe(0);
		expect(result.shippedToReleased).toBe(0);
		expect(result.pendingToRefunded).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.errors).toBe(0);
	});

	it('does NOT call getUtxosByAddress when no rows are returned', async () => {
		mockNot.mockResolvedValueOnce({ data: [], error: null });

		await main();

		expect(mockGetUtxosByAddress).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Supabase query shape
// ---------------------------------------------------------------------------
describe('Supabase query', () => {
	it('queries escrows WHERE status NOT IN (released, refunded)', async () => {
		mockNot.mockResolvedValueOnce({ data: [], error: null });

		await main();

		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockSelect).toHaveBeenCalledWith('*');
		expect(mockNot).toHaveBeenCalledWith('status', 'in', '(released,refunded)');
	});

	it('throws when Supabase returns an error', async () => {
		mockNot.mockResolvedValueOnce({ data: null, error: { message: 'DB query error' } });

		await expect(main()).rejects.toThrow('DB query error');
	});
});

// ---------------------------------------------------------------------------
// UTxO still at script address, datum unchanged (Pending) → skip
// ---------------------------------------------------------------------------
describe('UTxO in sync — skip', () => {
	it('skips a row when the UTxO is still at the script address with Pending datum', async () => {
		mockNot.mockResolvedValueOnce({ data: [ESCROW_PENDING], error: null });
		// UTxO is present at script address, datum has no grace_period_end (Pending)
		mockGetUtxosByAddress.mockResolvedValueOnce([
			{
				txHash: 'tx_pending_utxo',
				outputIndex: 0,
				datumCbor: 'd87980', // OptionInt::None — Pending
			},
		]);

		const result = await main();

		expect(result.skipped).toBe(1);
		expect(result.pendingToShipped).toBe(0);
		expect(mockEq).not.toHaveBeenCalled();
		expect(mockInsertOrderEvent).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// UTxO at script address, datum has grace_period_end set → pending→shipped
// ---------------------------------------------------------------------------
describe('UTxO Shipped on-chain but DB shows Pending', () => {
	it('updates status to shipped, sets new utxo refs, grace_period_end, shipped_tx_hash, inserts order_events', async () => {
		mockNot.mockResolvedValueOnce({ data: [ESCROW_PENDING_NOW_SHIPPED], error: null });

		// UTxO is still at script address but datum shows Shipped (grace_period_end = Some(value))
		// Shipped datum: constr 1 (tag 122) with a list containing the grace period timestamp
		const shippedDatumCbor = 'd87a801b00000198877cf080'; // placeholder for Some(grace_period)
		mockGetUtxosByAddress.mockResolvedValueOnce([
			{
				txHash: 'tx_shipped_utxo',
				outputIndex: 1,
				datumCbor: shippedDatumCbor, // Has Some(grace_period_end) — Shipped
			},
		]);

		const result = await main();

		expect(result.pendingToShipped).toBe(1);

		// Should have called update on escrows
		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'shipped',
				utxo_tx_hash: 'tx_shipped_utxo',
				utxo_output_index: 1,
				datum_cbor: shippedDatumCbor,
				grace_period_end: expect.any(String),
				shipped_tx_hash: 'tx_shipped_utxo',
			}),
		);
		expect(mockEq).toHaveBeenCalledWith('order_id', ESCROW_PENDING_NOW_SHIPPED.order_id);

		// Should have inserted missing order_events row
		expect(mockInsertOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ESCROW_PENDING_NOW_SHIPPED.order_id,
				event_type: 'shipped',
				tx_hash: 'tx_shipped_utxo',
			}),
		);
	});

	it('counts an error when the DB update throws', async () => {
		mockNot.mockResolvedValueOnce({ data: [ESCROW_PENDING_NOW_SHIPPED], error: null });
		const shippedDatumCbor = 'd87a801b00000198877cf080';
		mockGetUtxosByAddress.mockResolvedValueOnce([
			{ txHash: 'tx_shipped_utxo', outputIndex: 1, datumCbor: shippedDatumCbor },
		]);
		mockEq.mockResolvedValueOnce({ error: { message: 'update failed' } });

		const result = await main();

		expect(result.errors).toBe(1);
		expect(result.pendingToShipped).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// UTxO consumed — determine Released vs Refunded by spending tx outputs
// ---------------------------------------------------------------------------
describe('UTxO consumed — Released (value goes to merchant)', () => {
	it('detects Released when spending tx output goes to merchant address', async () => {
		mockNot.mockResolvedValueOnce({ data: [ESCROW_SHIPPED], error: null });

		// UTxO is no longer at script address (not in set)
		mockGetUtxosByAddress.mockResolvedValueOnce([]);

		// Spending tx sends to merchant address → Released
		const releaseTxHash = 'tx_release_hash';
		mockGetSpendingTx.mockResolvedValueOnce({
			txHash: releaseTxHash,
			outputs: [
				{
					address: STUB_CONFIG.merchantAddress,
					value: 5000000,
				},
			],
		});

		const result = await main();

		expect(result.shippedToReleased).toBe(1);

		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'released',
				release_tx_hash: releaseTxHash,
			}),
		);
		expect(mockEq).toHaveBeenCalledWith('order_id', ESCROW_SHIPPED.order_id);

		expect(mockInsertOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ESCROW_SHIPPED.order_id,
				event_type: 'completed',
				tx_hash: releaseTxHash,
			}),
		);
	});
});

describe('UTxO consumed — Refunded (value goes to buyer)', () => {
	it('detects Refunded when spending tx output goes to buyer address (not merchant)', async () => {
		// For refund detection, we need to look up the buyer's address from their pkh
		// Pending escrow that was refunded without going through shipped
		const ESCROW_PENDING_REFUNDED: Database.Escrow = {
			...ESCROW_PENDING,
			id: 'esc-dddd-dddd-dddd-dddddddddddd',
			order_id: 'ord-4444',
			utxo_tx_hash: 'tx_refund_utxo',
			utxo_output_index: 0,
		};

		mockNot.mockResolvedValueOnce({ data: [ESCROW_PENDING_REFUNDED], error: null });

		// UTxO is not at script address
		mockGetUtxosByAddress.mockResolvedValueOnce([]);

		// Spending tx sends to buyer (not merchant) → Refunded
		const refundTxHash = 'tx_refund_hash';
		mockGetSpendingTx.mockResolvedValueOnce({
			txHash: refundTxHash,
			outputs: [
				{
					address: 'addr1qbuyer_address_here', // NOT the merchant address
					value: 5000000,
				},
			],
		});

		const result = await main();

		expect(result.pendingToRefunded).toBe(1);

		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'refunded',
				refund_tx_hash: refundTxHash,
			}),
		);
		expect(mockEq).toHaveBeenCalledWith('order_id', ESCROW_PENDING_REFUNDED.order_id);

		expect(mockInsertOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ESCROW_PENDING_REFUNDED.order_id,
				event_type: 'cancelled',
				tx_hash: refundTxHash,
			}),
		);
	});

	it('counts an error when getSpendingTx throws', async () => {
		mockNot.mockResolvedValueOnce({ data: [ESCROW_SHIPPED], error: null });
		mockGetUtxosByAddress.mockResolvedValueOnce([]);
		mockGetSpendingTx.mockRejectedValueOnce(new Error('chain unavailable'));

		const result = await main();

		expect(result.errors).toBe(1);
		expect(result.shippedToReleased).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Summary counts
// ---------------------------------------------------------------------------
describe('summary counts', () => {
	it('prints a summary with counts by transition type', async () => {
		// One pending (in-sync), one pending→shipped, one shipped→released
		const ESCROW_RELEASED_CANDIDATE: Database.Escrow = {
			...ESCROW_SHIPPED,
			id: 'esc-eeee-eeee-eeee-eeeeeeeeeeee',
			order_id: 'ord-5555',
			utxo_tx_hash: 'tx_released_utxo',
		};

		mockNot.mockResolvedValueOnce({
			data: [ESCROW_PENDING, ESCROW_PENDING_NOW_SHIPPED, ESCROW_RELEASED_CANDIDATE],
			error: null,
		});

		const shippedDatumCbor = 'd87a801b00000198877cf080';

		// Call 1: ESCROW_PENDING — UTxO present, Pending datum (in sync)
		// Call 2: ESCROW_PENDING_NOW_SHIPPED — UTxO present, Shipped datum
		// Call 3: ESCROW_RELEASED_CANDIDATE — UTxO absent
		mockGetUtxosByAddress
			.mockResolvedValueOnce([{ txHash: 'tx_pending_utxo', outputIndex: 0, datumCbor: 'd87980' }])
			.mockResolvedValueOnce([{ txHash: 'tx_shipped_utxo', outputIndex: 1, datumCbor: shippedDatumCbor }])
			.mockResolvedValueOnce([]);

		mockGetSpendingTx.mockResolvedValueOnce({
			txHash: 'tx_release_hash_2',
			outputs: [{ address: STUB_CONFIG.merchantAddress, value: 5000000 }],
		});

		const result = await main();

		expect(result.skipped).toBe(1);
		expect(result.pendingToShipped).toBe(1);
		expect(result.shippedToReleased).toBe(1);
		expect(result.pendingToRefunded).toBe(0);
		expect(result.errors).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Graceful error handling per row
// ---------------------------------------------------------------------------
describe('per-row error isolation', () => {
	it('continues processing remaining rows when one row throws an error', async () => {
		mockNot.mockResolvedValueOnce({ data: [ESCROW_PENDING, ESCROW_SHIPPED], error: null });

		// First call (ESCROW_PENDING) — throws
		mockGetUtxosByAddress
			.mockRejectedValueOnce(new Error('network error'))
			// Second call (ESCROW_SHIPPED) — UTxO absent
			.mockResolvedValueOnce([]);

		mockGetSpendingTx.mockResolvedValueOnce({
			txHash: 'tx_release_after_error',
			outputs: [{ address: STUB_CONFIG.merchantAddress, value: 5000000 }],
		});

		const result = await main();

		expect(result.errors).toBe(1);
		expect(result.shippedToReleased).toBe(1);
	});
});
