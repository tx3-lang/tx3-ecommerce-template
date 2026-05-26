/**
 * Tests for scripts/mark-order-completed.ts
 *
 * Tests the `main(args)` function extracted from the CLI entry point.
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js      — Supabase client (orders SELECT + UPDATE)
 *   - @/lib/cardano/traceability — submitCompletedTrace
 *   - @/server-fns/order-events  — insertOrderEvent
 *   - @/lib/cardano/network      — getNetworkConfig (controls explorer URL)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared Supabase mock fns
// The transition helper does:
//   supabase.from('orders').select('status').eq('id', orderId).single()
//   supabase.from('orders').update({ status: 'completed' }).eq('id', orderId)
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();
// SELECT chain: .select(...).eq(...).single()
const mockEqSelect = vi.fn(() => ({ single: mockSingle }));
const mockSelectOrders = vi.fn(() => ({ eq: mockEqSelect }));

// UPDATE chain: .update(...).eq(...)
const mockEqUpdate = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEqUpdate }));

const mockFrom = vi.fn((_table: string) => ({
	select: mockSelectOrders,
	update: mockUpdate,
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		from: mockFrom,
	})),
}));

// ---------------------------------------------------------------------------
// Mock: submitCompletedTrace
// ---------------------------------------------------------------------------
const mockSubmitCompletedTrace = vi.fn();

vi.mock('@/lib/cardano/traceability', () => ({
	submitCompletedTrace: mockSubmitCompletedTrace,
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
const { main } = await import('../mark-order-completed.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TX_HASH = 'cafebabe00112233deadbeef445566778899aabbccddeeff00112233445566778899';
const TRACE_RESULT = { txHash: TX_HASH, confirmed: false };
const SAMPLE_EVENT: Database.OrderEvent = {
	id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
	order_id: ORDER_ID,
	event_type: 'completed',
	tx_hash: TX_HASH,
	payload: { v: 1, event: 'completed' },
	submitted_at: '2026-05-22T00:00:00Z',
	confirmed_at: null,
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
	mockSubmitCompletedTrace.mockResolvedValue(TRACE_RESULT);
	mockInsertOrderEvent.mockResolvedValue(SAMPLE_EVENT);
	mockEqUpdate.mockResolvedValue({ error: null });

	// Default: order is in 'shipped' status (only allowed source for completed)
	mockSingle.mockResolvedValue({ data: { status: 'shipped' }, error: null });
});

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
describe('arg parsing', () => {
	it('rejects missing --order-id with MISSING_ARG error', async () => {
		await expect(main([])).rejects.toThrow('MISSING_ARG');
	});

	it('accepts --order-id alone (no other required args)', async () => {
		await expect(main(['--order-id', ORDER_ID])).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Status validation
// ---------------------------------------------------------------------------
describe('status validation', () => {
	it('proceeds when order status is "shipped"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'shipped' }, error: null });

		await expect(main(['--order-id', ORDER_ID])).resolves.not.toThrow();
	});

	it('aborts with INVALID_TRANSITION when order status is "paid"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'paid' }, error: null });

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_TRANSITION');
	});

	it('aborts with INVALID_TRANSITION when order status is "pending"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'pending' }, error: null });

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_TRANSITION');
	});

	it('aborts with INVALID_TRANSITION when order status is already "completed"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'completed' }, error: null });

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_TRANSITION');
	});

	it('aborts with INVALID_TRANSITION when order status is "cancelled"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'cancelled' }, error: null });

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_TRANSITION');
	});

	it('aborts with ORDER_NOT_FOUND when Supabase returns null data', async () => {
		mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found', code: 'PGRST116' } });

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('ORDER_NOT_FOUND');
	});
});

// ---------------------------------------------------------------------------
// submitCompletedTrace call
// ---------------------------------------------------------------------------
describe('submitCompletedTrace', () => {
	it('calls submitCompletedTrace with orderId', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockSubmitCompletedTrace).toHaveBeenCalledOnce();
		expect(mockSubmitCompletedTrace).toHaveBeenCalledWith(ORDER_ID);
	});
});

// ---------------------------------------------------------------------------
// DB updates on success
// ---------------------------------------------------------------------------
describe('DB updates on success', () => {
	it('calls insertOrderEvent with event_type="completed", the tx hash, and a payload', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockInsertOrderEvent).toHaveBeenCalledOnce();
		expect(mockInsertOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ORDER_ID,
				event_type: 'completed',
				tx_hash: TX_HASH,
				payload: expect.objectContaining({ event: 'completed' }),
			}),
		);
	});

	it('updates orders.status to "completed"', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
		expect(mockEqUpdate).toHaveBeenCalledWith('id', ORDER_ID);
	});
});

// ---------------------------------------------------------------------------
// submitCompletedTrace failure — rollback
// ---------------------------------------------------------------------------
describe('submitCompletedTrace failure', () => {
	it('does NOT update orders.status when submitCompletedTrace throws', async () => {
		mockSubmitCompletedTrace.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow();

		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it('does NOT call insertOrderEvent when submitCompletedTrace throws', async () => {
		mockSubmitCompletedTrace.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow();

		expect(mockInsertOrderEvent).not.toHaveBeenCalled();
	});

	it('propagates the chain error', async () => {
		mockSubmitCompletedTrace.mockRejectedValueOnce(new Error('TxRejected'));

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('TxRejected');
	});
});

// ---------------------------------------------------------------------------
// Explorer URL output
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
