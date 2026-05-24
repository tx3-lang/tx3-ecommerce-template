/**
 * Tests for scripts/escrow-mark-shipped.ts
 *
 * Tests the `main(args)` function extracted from the CLI entry point.
 *
 * Scope note: escrow-mark-shipped owns ONLY the `escrows` table. It does not
 * write `orders.status` nor `order_events` (those belong to the traceability
 * scripts), so this suite asserts the escrows UPDATE and the absence of any
 * orders/order_events writes.
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js           — Supabase client (escrows SELECT, escrows UPDATE)
 *   - @/lib/cardano/escrow            — submitMarkShipped
 *   - @/lib/cardano/network           — getNetworkConfig (controls explorer URL)
 *   - @/lib/cardano/escrow-policy     — getGracePeriodSeconds
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared Supabase mock fns
//
// The script does (two separate `from()` calls):
//   supabase.from('escrows').select('*').eq('order_id', orderId).single()
//   supabase.from('escrows').update({...}).eq('order_id', orderId)
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();
// SELECT chain: .select('*').eq(...).single()
const mockEqSelect = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEqSelect }));

// UPDATE chain: .update(...).eq(...)
const mockEqUpdate = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEqUpdate }));

const mockFrom = vi.fn((_table: string) => ({
	select: mockSelect,
	update: mockUpdate,
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		from: mockFrom,
	})),
}));

// ---------------------------------------------------------------------------
// Mock: submitMarkShipped
// ---------------------------------------------------------------------------
const mockSubmitMarkShipped = vi.fn();

vi.mock('@/lib/cardano/escrow', () => ({
	submitMarkShipped: mockSubmitMarkShipped,
}));

// ---------------------------------------------------------------------------
// Mock: getNetworkConfig
// ---------------------------------------------------------------------------
const mockGetNetworkConfig = vi.fn();

vi.mock('@/lib/cardano/network', () => ({
	getNetworkConfig: mockGetNetworkConfig,
}));

// ---------------------------------------------------------------------------
// Mock: getGracePeriodSeconds
// ---------------------------------------------------------------------------
const mockGetGracePeriodSeconds = vi.fn();

vi.mock('@/lib/cardano/escrow-policy', () => ({
	getGracePeriodSeconds: mockGetGracePeriodSeconds,
	getShipDeadlineSeconds: vi.fn(() => 2592000),
}));

// ---------------------------------------------------------------------------
// Env setup (service-role Supabase client)
// ---------------------------------------------------------------------------
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'service-role-secret';

// ---------------------------------------------------------------------------
// Import module under test (AFTER mocks are registered — vi.mock is hoisted)
// ---------------------------------------------------------------------------
const { main } = await import('../escrow-mark-shipped.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TX_HASH = 'cafebabe00112233deadbeef445566778899aabbccddeeff00112233445566778899';
const NEW_TX_HASH = 'deadbeef00112233cafebabe445566778899aabbccddeeff00112233445566778899';
const NEW_DATUM_CBOR = 'd87a80';
const GRACE_PERIOD_SECONDS = 1209600; // 14 days

const MARK_SHIPPED_RESULT = {
	txHash: TX_HASH,
	newUtxoRef: { txHash: NEW_TX_HASH, outputIndex: 0 },
	newDatumCbor: NEW_DATUM_CBOR,
};

// Future ship_deadline (pending, valid)
const FUTURE_DEADLINE = new Date(Date.now() + 86400 * 1000).toISOString(); // +1 day
// Expired ship_deadline
const PAST_DEADLINE = new Date(Date.now() - 86400 * 1000).toISOString(); // -1 day

const STUB_ESCROW_PENDING: Database.Escrow = {
	id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
	order_id: ORDER_ID,
	script_address: 'addr_test1_script',
	utxo_tx_hash: 'aabbccdd00112233',
	utxo_output_index: 0,
	status: 'pending',
	buyer_pkh: '00'.repeat(28),
	merchant_pkh: 'ff'.repeat(28),
	paid_at: new Date(Date.now() - 3600 * 1000).toISOString(),
	ship_deadline: FUTURE_DEADLINE,
	grace_period_end: null,
	datum_cbor: 'd87a80',
	shipped_tx_hash: null,
	release_tx_hash: null,
	refund_tx_hash: null,
	created_at: '2026-05-22T00:00:00Z',
	updated_at: '2026-05-22T00:00:00Z',
};

const STUB_NETWORK_PREVIEW = {
	trpEndpoint: 'https://preview.trp.example.com',
	profile: 'preview' as const,
	metadataLabel: 1337,
	merchantAddress: 'addr1qtest_merchant',
};

const STUB_NETWORK_LOCAL = {
	...STUB_NETWORK_PREVIEW,
	profile: 'local' as const,
};

beforeEach(() => {
	vi.clearAllMocks();

	// Default happy-path stubs
	mockGetNetworkConfig.mockReturnValue(STUB_NETWORK_PREVIEW);
	mockGetGracePeriodSeconds.mockReturnValue(GRACE_PERIOD_SECONDS);
	mockSubmitMarkShipped.mockResolvedValue(MARK_SHIPPED_RESULT);
	mockEqUpdate.mockResolvedValue({ error: null });

	// Default: escrow is pending with future deadline
	mockSingle.mockResolvedValue({ data: STUB_ESCROW_PENDING, error: null });
});

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
describe('arg parsing', () => {
	it('rejects missing --order-id with MISSING_ARG error', async () => {
		await expect(main([])).rejects.toThrow('MISSING_ARG');
	});

	it('accepts --order-id', async () => {
		await expect(main(['--order-id', ORDER_ID])).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Escrow state validation (SELECT ... FOR UPDATE semantics via optimistic lock)
// ---------------------------------------------------------------------------
describe('escrow state validation', () => {
	it('queries the escrows table for the given order_id', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockSelect).toHaveBeenCalledWith('*');
		expect(mockEqSelect).toHaveBeenCalledWith('order_id', ORDER_ID);
		expect(mockSingle).toHaveBeenCalled();
	});

	it('aborts with INVALID_STATE when escrow status is not "pending"', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_PENDING, status: 'shipped' },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_STATE');
	});

	it('aborts with INVALID_STATE when escrow status is "released"', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_PENDING, status: 'released' },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_STATE');
	});

	it('aborts with SHIP_DEADLINE_EXCEEDED when NOW() >= ship_deadline', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_PENDING, ship_deadline: PAST_DEADLINE },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('SHIP_DEADLINE_EXCEEDED');
	});

	it('aborts with ESCROW_NOT_FOUND when Supabase returns no data', async () => {
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { message: 'not found', code: 'PGRST116' },
		});

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('ESCROW_NOT_FOUND');
	});

	it('proceeds when status="pending" and ship_deadline is in the future', async () => {
		await expect(main(['--order-id', ORDER_ID])).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// submitMarkShipped call
// ---------------------------------------------------------------------------
describe('submitMarkShipped', () => {
	it('calls submitMarkShipped with the orderId', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockSubmitMarkShipped).toHaveBeenCalledOnce();
		expect(mockSubmitMarkShipped).toHaveBeenCalledWith(ORDER_ID);
	});
});

// ---------------------------------------------------------------------------
// DB updates on success — escrows table only
// ---------------------------------------------------------------------------
describe('DB updates on success', () => {
	it('updates escrows with status=shipped, new utxo refs, shipped_tx_hash, grace_period_end, datum_cbor', async () => {
		await main(['--order-id', ORDER_ID]);

		// Should update escrows table
		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'shipped',
				shipped_tx_hash: TX_HASH,
				utxo_tx_hash: NEW_TX_HASH,
				utxo_output_index: 0,
				datum_cbor: NEW_DATUM_CBOR,
				grace_period_end: expect.any(String),
			}),
		);
	});

	it('does NOT write orders.status nor order_events (owned by traceability)', async () => {
		await main(['--order-id', ORDER_ID]);

		// Only the escrows table is ever touched
		expect(mockFrom).not.toHaveBeenCalledWith('orders');
		expect(mockFrom).not.toHaveBeenCalledWith('order_events');
	});

	it('computes grace_period_end from getGracePeriodSeconds()', async () => {
		const before = Date.now();
		await main(['--order-id', ORDER_ID]);
		const after = Date.now();

		type EscrowUpdatePayload = {
			status: string;
			grace_period_end?: string;
		};

		const allUpdateCalls = mockUpdate.mock.calls as unknown as Array<[EscrowUpdatePayload]>;
		const updateCall = allUpdateCalls.find((call) => {
			const payload = call[0];
			return payload.status === 'shipped' && 'grace_period_end' in payload;
		});
		expect(updateCall).toBeDefined();
		const payload = updateCall![0];
		const graceMs = new Date(payload.grace_period_end!).getTime();
		// grace_period_end should be approximately now + GRACE_PERIOD_SECONDS * 1000
		expect(graceMs).toBeGreaterThanOrEqual(before + GRACE_PERIOD_SECONDS * 1000);
		expect(graceMs).toBeLessThanOrEqual(after + GRACE_PERIOD_SECONDS * 1000 + 100);
	});
});

// ---------------------------------------------------------------------------
// submitMarkShipped failure — DB stays clean (no writes on chain failure)
// ---------------------------------------------------------------------------
describe('submitMarkShipped failure', () => {
	it('does NOT update escrows when submitMarkShipped throws', async () => {
		mockSubmitMarkShipped.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow();

		// Only escrows SELECT should have been called, not UPDATE
		const updateCalls = mockUpdate.mock.calls;
		expect(updateCalls).toHaveLength(0);
	});

	it('propagates the chain error', async () => {
		mockSubmitMarkShipped.mockRejectedValueOnce(new Error('TxRejected'));

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('TxRejected');
	});
});

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
describe('output', () => {
	it('includes the tx hash in the return value', async () => {
		const result = await main(['--order-id', ORDER_ID]);

		expect(result.txHash).toBe(TX_HASH);
	});

	it('includes a preview.cexplorer.io explorer URL when profile is "preview"', async () => {
		mockGetNetworkConfig.mockReturnValue(STUB_NETWORK_PREVIEW);

		const result = await main(['--order-id', ORDER_ID]);

		expect(result.explorerUrl).toBe(`https://preview.cexplorer.io/tx/${TX_HASH}`);
	});

	it('does NOT include an explorer URL when profile is "local"', async () => {
		mockGetNetworkConfig.mockReturnValue(STUB_NETWORK_LOCAL);

		const result = await main(['--order-id', ORDER_ID]);

		expect(result.explorerUrl).toBeUndefined();
	});
});
