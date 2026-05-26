/**
 * Tests for scripts/mark-order-shipped.ts
 *
 * Tests the `main(args)` function extracted from the CLI entry point.
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js      — Supabase client (orders SELECT + UPDATE)
 *   - @/lib/cardano/traceability — submitShippedTrace
 *   - @/server-fns/order-events  — insertOrderEvent
 *   - @/lib/cardano/network      — getNetworkConfig (controls explorer URL)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared Supabase mock fns
// The script does:
//   supabase.from('orders').select('status').eq('id', orderId).single()
//   supabase.from('orders').update({ status: 'shipped' }).eq('id', orderId)
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
// Mock: submitShippedTrace
// ---------------------------------------------------------------------------
const mockSubmitShippedTrace = vi.fn();

vi.mock('@/lib/cardano/traceability', () => ({
	submitShippedTrace: mockSubmitShippedTrace,
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
const { main } = await import('../mark-order-shipped.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TRACKING = 'TRACK-XYZ-001';
const TX_HASH = 'cafebabe00112233deadbeef445566778899aabbccddeeff00112233445566778899';
const TRACE_RESULT = { txHash: TX_HASH, confirmed: false };
const SAMPLE_EVENT: Database.OrderEvent = {
	id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
	order_id: ORDER_ID,
	event_type: 'shipped',
	tx_hash: TX_HASH,
	payload: { v: 1, event: 'shipped' },
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
	mockSubmitShippedTrace.mockResolvedValue(TRACE_RESULT);
	mockInsertOrderEvent.mockResolvedValue(SAMPLE_EVENT);
	mockEqUpdate.mockResolvedValue({ error: null });

	// Default: order is in 'paid' status
	mockSingle.mockResolvedValue({ data: { status: 'paid' }, error: null });
});

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
describe('arg parsing', () => {
	it('rejects missing --order-id with a non-zero exit', async () => {
		await expect(main([])).rejects.toThrow('MISSING_ARG');
	});

	it('accepts --order-id without --tracking (tracking is optional)', async () => {
		await expect(main(['--order-id', ORDER_ID])).resolves.not.toThrow();
	});

	it('accepts --order-id with --tracking', async () => {
		await expect(main(['--order-id', ORDER_ID, '--tracking', TRACKING])).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Status validation
// ---------------------------------------------------------------------------
describe('status validation', () => {
	it('aborts with INVALID_TRANSITION when order status is not "paid"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'pending' }, error: null });

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_TRANSITION');
	});

	it('aborts with INVALID_TRANSITION when order status is "shipped"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'shipped' }, error: null });

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_TRANSITION');
	});

	it('aborts with INVALID_TRANSITION when order status is "completed"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'completed' }, error: null });

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('INVALID_TRANSITION');
	});

	it('aborts with ORDER_NOT_FOUND when Supabase returns null data', async () => {
		mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found', code: 'PGRST116' } });

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('ORDER_NOT_FOUND');
	});

	it('proceeds when order status is "paid"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'paid' }, error: null });

		await expect(main(['--order-id', ORDER_ID])).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// submitShippedTrace call
// ---------------------------------------------------------------------------
describe('submitShippedTrace', () => {
	it('calls submitShippedTrace with orderId and no tracking when --tracking is omitted', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockSubmitShippedTrace).toHaveBeenCalledOnce();
		expect(mockSubmitShippedTrace).toHaveBeenCalledWith(ORDER_ID, { trackingNumber: undefined });
	});

	it('calls submitShippedTrace with orderId and the tracking code when --tracking is provided', async () => {
		await main(['--order-id', ORDER_ID, '--tracking', TRACKING]);

		expect(mockSubmitShippedTrace).toHaveBeenCalledOnce();
		expect(mockSubmitShippedTrace).toHaveBeenCalledWith(ORDER_ID, { trackingNumber: TRACKING });
	});
});

// ---------------------------------------------------------------------------
// DB updates on success
// ---------------------------------------------------------------------------
describe('DB updates on success', () => {
	it('calls insertOrderEvent with event_type="shipped", the tx hash, and a payload', async () => {
		await main(['--order-id', ORDER_ID, '--tracking', TRACKING]);

		expect(mockInsertOrderEvent).toHaveBeenCalledOnce();
		expect(mockInsertOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ORDER_ID,
				event_type: 'shipped',
				tx_hash: TX_HASH,
				payload: expect.objectContaining({ event: 'shipped' }),
			}),
		);
	});

	it('updates orders.status to "shipped"', async () => {
		await main(['--order-id', ORDER_ID]);

		expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'shipped' }));
		expect(mockEqUpdate).toHaveBeenCalledWith('id', ORDER_ID);
	});
});

// ---------------------------------------------------------------------------
// submitShippedTrace failure — rollback
// ---------------------------------------------------------------------------
describe('submitShippedTrace failure', () => {
	it('does NOT update orders.status when submitShippedTrace throws', async () => {
		mockSubmitShippedTrace.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow();

		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it('does NOT call insertOrderEvent when submitShippedTrace throws', async () => {
		mockSubmitShippedTrace.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow();

		expect(mockInsertOrderEvent).not.toHaveBeenCalled();
	});

	it('propagates the chain error', async () => {
		mockSubmitShippedTrace.mockRejectedValueOnce(new Error('TxRejected'));

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
