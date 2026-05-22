/**
 * Tests for scripts/cancel-order.ts
 *
 * Tests the `main(args)` function extracted from the CLI entry point.
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js      — Supabase client (orders SELECT + UPDATE)
 *   - @/lib/cardano/traceability — submitCancelledTrace
 *   - @/server-fns/order-events  — insertOrderEvent
 *   - @/lib/cardano/network      — getNetworkConfig (controls explorer URL)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared Supabase mock fns
// The transition helper does:
//   supabase.from('orders').select('status').eq('id', orderId).single()
//   supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
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
// Mock: submitCancelledTrace
// ---------------------------------------------------------------------------
const mockSubmitCancelledTrace = vi.fn();

vi.mock('@/lib/cardano/traceability', () => ({
	submitCancelledTrace: mockSubmitCancelledTrace,
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
const { main } = await import('../cancel-order.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const REASON = 'Customer requested cancellation';
const TX_HASH = 'deadbeef00112233cafebabe445566778899aabbccddeeff00112233445566778899';
const TRACE_RESULT = { txHash: TX_HASH, confirmed: false };
const SAMPLE_EVENT: Database.OrderEvent = {
	id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
	order_id: ORDER_ID,
	event_type: 'cancelled',
	tx_hash: TX_HASH,
	payload: { v: 1, event: 'cancelled', reason: REASON },
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
	mockSubmitCancelledTrace.mockResolvedValue(TRACE_RESULT);
	mockInsertOrderEvent.mockResolvedValue(SAMPLE_EVENT);
	mockEqUpdate.mockResolvedValue({ error: null });

	// Default: order is in 'paid' status (one of the cancellable statuses)
	mockSingle.mockResolvedValue({ data: { status: 'paid' }, error: null });
});

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
describe('arg parsing', () => {
	it('rejects missing --order-id with MISSING_ARG error', async () => {
		await expect(main([])).rejects.toThrow('MISSING_ARG');
	});

	it('rejects missing --reason when --order-id is provided', async () => {
		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('MISSING_ARG');
	});

	it('rejects missing --order-id even when --reason is provided', async () => {
		await expect(main(['--reason', REASON])).rejects.toThrow('MISSING_ARG');
	});

	it('accepts both --order-id and --reason', async () => {
		await expect(main(['--order-id', ORDER_ID, '--reason', REASON])).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Status validation
// ---------------------------------------------------------------------------
describe('status validation', () => {
	it.each(['pending', 'payment_failed', 'paid', 'processing', 'shipped'] as const)(
		'proceeds when order status is "%s"',
		async status => {
			mockSingle.mockResolvedValueOnce({ data: { status }, error: null });

			await expect(main(['--order-id', ORDER_ID, '--reason', REASON])).resolves.not.toThrow();
		},
	);

	it('aborts with INVALID_TRANSITION when order status is "completed"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'completed' }, error: null });

		await expect(main(['--order-id', ORDER_ID, '--reason', REASON])).rejects.toThrow('INVALID_TRANSITION');
	});

	it('aborts with INVALID_TRANSITION when order status is already "cancelled"', async () => {
		mockSingle.mockResolvedValueOnce({ data: { status: 'cancelled' }, error: null });

		await expect(main(['--order-id', ORDER_ID, '--reason', REASON])).rejects.toThrow('INVALID_TRANSITION');
	});

	it('aborts with ORDER_NOT_FOUND when Supabase returns null data', async () => {
		mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found', code: 'PGRST116' } });

		await expect(main(['--order-id', ORDER_ID, '--reason', REASON])).rejects.toThrow('ORDER_NOT_FOUND');
	});
});

// ---------------------------------------------------------------------------
// submitCancelledTrace call
// ---------------------------------------------------------------------------
describe('submitCancelledTrace', () => {
	it('calls submitCancelledTrace with orderId and the reason', async () => {
		await main(['--order-id', ORDER_ID, '--reason', REASON]);

		expect(mockSubmitCancelledTrace).toHaveBeenCalledOnce();
		expect(mockSubmitCancelledTrace).toHaveBeenCalledWith(ORDER_ID, { reason: REASON });
	});
});

// ---------------------------------------------------------------------------
// DB updates on success
// ---------------------------------------------------------------------------
describe('DB updates on success', () => {
	it('calls insertOrderEvent with event_type="cancelled", the tx hash, and payload containing reason', async () => {
		await main(['--order-id', ORDER_ID, '--reason', REASON]);

		expect(mockInsertOrderEvent).toHaveBeenCalledOnce();
		expect(mockInsertOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ORDER_ID,
				event_type: 'cancelled',
				tx_hash: TX_HASH,
				payload: expect.objectContaining({
					event: 'cancelled',
					reason: REASON,
				}),
			}),
		);
	});

	it('updates orders.status to "cancelled"', async () => {
		await main(['--order-id', ORDER_ID, '--reason', REASON]);

		expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
		expect(mockEqUpdate).toHaveBeenCalledWith('id', ORDER_ID);
	});
});

// ---------------------------------------------------------------------------
// submitCancelledTrace failure — rollback
// ---------------------------------------------------------------------------
describe('submitCancelledTrace failure', () => {
	it('does NOT update orders.status when submitCancelledTrace throws', async () => {
		mockSubmitCancelledTrace.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID, '--reason', REASON])).rejects.toThrow();

		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it('does NOT call insertOrderEvent when submitCancelledTrace throws', async () => {
		mockSubmitCancelledTrace.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID, '--reason', REASON])).rejects.toThrow();

		expect(mockInsertOrderEvent).not.toHaveBeenCalled();
	});

	it('propagates the chain error', async () => {
		mockSubmitCancelledTrace.mockRejectedValueOnce(new Error('TxRejected'));

		await expect(main(['--order-id', ORDER_ID, '--reason', REASON])).rejects.toThrow('TxRejected');
	});
});

// ---------------------------------------------------------------------------
// Explorer URL output
// ---------------------------------------------------------------------------
describe('output', () => {
	it('includes the tx hash in the return value', async () => {
		const result = await main(['--order-id', ORDER_ID, '--reason', REASON]);

		expect(result.txHash).toBe(TX_HASH);
	});

	it('includes a preview.cexplorer.io explorer URL when profile is "preview"', async () => {
		mockGetNetworkConfig.mockReturnValue(STUB_NETWORK_PREVIEW);

		const result = await main(['--order-id', ORDER_ID, '--reason', REASON]);

		expect(result.explorerUrl).toBe(`https://preview.cexplorer.io/tx/${TX_HASH}`);
	});

	it('does NOT include an explorer URL when profile is "local"', async () => {
		mockGetNetworkConfig.mockReturnValue(STUB_NETWORK_LOCAL);

		const result = await main(['--order-id', ORDER_ID, '--reason', REASON]);

		expect(result.explorerUrl).toBeUndefined();
	});
});
