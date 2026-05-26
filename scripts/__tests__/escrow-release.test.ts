/**
 * Tests for scripts/escrow-release.ts
 *
 * Tests the `main(args)` function extracted from the CLI entry point.
 *
 * Scope note: escrow-release owns ONLY the `escrows` table. It does not write
 * `orders.status` nor `order_events` (those belong to the traceability scripts),
 * so this suite asserts the escrows UPDATE and the absence of any
 * orders/order_events writes.
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js           — Supabase client (escrows SELECT, escrows UPDATE)
 *   - @/lib/cardano/escrow            — submitReleaseEscrow
 *   - @/lib/cardano/network           — getNetworkConfig (controls explorer URL)
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
// Mock: submitReleaseEscrow
// ---------------------------------------------------------------------------
const mockSubmitReleaseEscrow = vi.fn();

vi.mock('@/lib/cardano/escrow', () => ({
	submitReleaseEscrow: mockSubmitReleaseEscrow,
}));

// ---------------------------------------------------------------------------
// Mock: getNetworkConfig
// ---------------------------------------------------------------------------
const mockGetNetworkConfig = vi.fn();

vi.mock('@/lib/cardano/network', () => ({
	getNetworkConfig: mockGetNetworkConfig,
}));

// ---------------------------------------------------------------------------
// Env setup (service-role Supabase client)
// ---------------------------------------------------------------------------
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'service-role-secret';

// ---------------------------------------------------------------------------
// Import module under test (AFTER mocks are registered — vi.mock is hoisted)
// ---------------------------------------------------------------------------
const { main } = await import('../escrow-release.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TX_HASH = 'cafebabe00112233deadbeef445566778899aabbccddeeff00112233445566778899';

const RELEASE_RESULT = { txHash: TX_HASH };

// Elapsed grace period (grace_period_end in the past)
const PAST_GRACE_PERIOD = new Date(Date.now() - 86400 * 1000).toISOString(); // -1 day
// Active grace period (grace_period_end in the future)
const FUTURE_GRACE_PERIOD = new Date(Date.now() + 86400 * 1000).toISOString(); // +1 day

const STUB_ESCROW_SHIPPED: Database.Escrow = {
	id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
	order_id: ORDER_ID,
	script_address: 'addr_test1_script',
	utxo_tx_hash: 'aabbccdd00112233',
	utxo_output_index: 0,
	status: 'shipped',
	buyer_pkh: '00'.repeat(28),
	merchant_pkh: 'ff'.repeat(28),
	paid_at: new Date(Date.now() - 3600 * 1000).toISOString(),
	ship_deadline: new Date(Date.now() - 86400 * 1000).toISOString(), // already shipped
	grace_period_end: PAST_GRACE_PERIOD,
	datum_cbor: 'd87980',
	shipped_tx_hash: 'aabbccdd11223344',
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
	mockSubmitReleaseEscrow.mockResolvedValue(RELEASE_RESULT);
	mockEqUpdate.mockResolvedValue({ error: null });

	// Default: escrow is shipped with elapsed grace period
	mockSingle.mockResolvedValue({ data: STUB_ESCROW_SHIPPED, error: null });
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
// Escrow state validation
// ---------------------------------------------------------------------------
describe('escrow state validation', () => {
	it('queries the escrows table for the given order_id', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockSelect).toHaveBeenCalledWith('*');
		expect(mockEqSelect).toHaveBeenCalledWith('order_id', ORDER_ID);
		expect(mockSingle).toHaveBeenCalled();
	});

	it('aborts with INVALID_STATE when escrow status is "pending" (not shipped)', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_SHIPPED, status: 'pending' },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_STATE');
	});

	it('aborts with INVALID_STATE when escrow status is "refunded"', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_SHIPPED, status: 'refunded' },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_STATE');
	});

	it('aborts with INVALID_STATE when escrow status is "released"', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_SHIPPED, status: 'released' },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_STATE');
	});

	it('aborts with GRACE_PERIOD_NOT_ELAPSED when NOW() < grace_period_end', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_SHIPPED, grace_period_end: FUTURE_GRACE_PERIOD },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('GRACE_PERIOD_NOT_ELAPSED');
	});

	it('aborts with INVALID_STATE when grace_period_end is null', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_SHIPPED, grace_period_end: null },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_STATE');
	});

	it('aborts with ESCROW_NOT_FOUND when Supabase returns no data', async () => {
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { message: 'not found', code: 'PGRST116' },
		});

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('ESCROW_NOT_FOUND');
	});

	it('proceeds when status="shipped" and grace_period_end has elapsed', async () => {
		await expect(main(['--order-id', ORDER_ID])).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// submitReleaseEscrow call
// ---------------------------------------------------------------------------
describe('submitReleaseEscrow', () => {
	it('calls submitReleaseEscrow with the orderId', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockSubmitReleaseEscrow).toHaveBeenCalledOnce();
		expect(mockSubmitReleaseEscrow).toHaveBeenCalledWith(ORDER_ID);
	});
});

// ---------------------------------------------------------------------------
// DB updates on success
// ---------------------------------------------------------------------------
describe('DB updates on success', () => {
	it('updates escrows with status="released" and release_tx_hash', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'released',
				release_tx_hash: TX_HASH,
			}),
		);
		expect(mockEqUpdate).toHaveBeenCalledWith('order_id', ORDER_ID);
	});

	it('does NOT write orders.status nor order_events (owned by traceability)', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockFrom).not.toHaveBeenCalledWith('orders');
		expect(mockFrom).not.toHaveBeenCalledWith('order_events');
	});
});

// ---------------------------------------------------------------------------
// submitReleaseEscrow failure — DB stays clean (no writes on chain failure)
// ---------------------------------------------------------------------------
describe('submitReleaseEscrow failure', () => {
	it('does NOT update escrows when submitReleaseEscrow throws', async () => {
		mockSubmitReleaseEscrow.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow();

		// Only escrows SELECT should have been called, not UPDATE
		const updateCalls = mockUpdate.mock.calls;
		expect(updateCalls).toHaveLength(0);
	});

	it('propagates the chain error', async () => {
		mockSubmitReleaseEscrow.mockRejectedValueOnce(new Error('TxRejected'));

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
