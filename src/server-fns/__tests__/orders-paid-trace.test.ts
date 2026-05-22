/**
 * Tests for submitPaidTrace integration in updateOrderStatusServerFn.
 *
 * When status transitions to 'paid':
 *  1. submitPaidTrace is called once with the orderId.
 *  2. insertOrderEvent is called once with event_type='paid', the tx hash, and payload.
 *  3. If submitPaidTrace throws, the DB status update is NOT applied and no
 *     order_events row is inserted.
 *
 * All external boundaries are mocked:
 *  - @supabase/supabase-js  — Supabase client
 *  - @/lib/cardano/traceability  — submitPaidTrace
 *  - @/server-fns/order-events   — insertOrderEvent
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared Supabase mock fns
// ---------------------------------------------------------------------------
const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockInsertSupabase = vi.fn(() => ({ select: mockSelect }));

// update chain: .update(data).eq(col, val)
const mockEqUpdate = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEqUpdate }));

// select chain for getOrderServerFn fetch after update
const mockEqSelect = vi.fn(() => ({ single: mockSingle }));
const mockSelectFetch = vi.fn(() => ({ eq: mockEqSelect }));

const mockFrom = vi.fn((table: string) => {
	void table;
	return {
		insert: mockInsertSupabase,
		update: mockUpdate,
		select: mockSelectFetch,
	};
});

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		from: mockFrom,
	})),
}));

// ---------------------------------------------------------------------------
// Mock: submitPaidTrace
// ---------------------------------------------------------------------------
const mockSubmitPaidTrace = vi.fn();

vi.mock('@/lib/cardano/traceability', () => ({
	submitPaidTrace: mockSubmitPaidTrace,
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
// Env setup
// ---------------------------------------------------------------------------
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'service-role-secret';

// ---------------------------------------------------------------------------
// Import module under test (AFTER mocks are registered — vi.mock is hoisted)
// ---------------------------------------------------------------------------
const { updateOrderStatusWithServiceRole } = await import('../orders.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TX_HASH = 'deadbeefcafebabe00112233445566778899aabbccddeeff00112233445566778899';
const TRACE_RESULT = { txHash: 'cafebabe00112233deadbeef', confirmed: false };
const SAMPLE_EVENT: Database.OrderEvent = {
	id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
	order_id: ORDER_ID,
	event_type: 'paid',
	tx_hash: TRACE_RESULT.txHash,
	payload: { v: 1, event: 'paid' },
	submitted_at: '2026-05-22T00:00:00Z',
	confirmed_at: null,
};

beforeEach(() => {
	vi.clearAllMocks();

	// Default happy-path stubs
	mockSubmitPaidTrace.mockResolvedValue(TRACE_RESULT);
	mockInsertOrderEvent.mockResolvedValue(SAMPLE_EVENT);
	mockEqUpdate.mockResolvedValue({ error: null });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
describe('updateOrderStatusWithServiceRole — status="paid"', () => {
	it('calls submitPaidTrace once with the correct orderId', async () => {
		await updateOrderStatusWithServiceRole(ORDER_ID, 'paid', TX_HASH);

		expect(mockSubmitPaidTrace).toHaveBeenCalledOnce();
		expect(mockSubmitPaidTrace).toHaveBeenCalledWith(ORDER_ID);
	});

	it('calls insertOrderEvent with event_type="paid", the trace txHash, and a payload', async () => {
		await updateOrderStatusWithServiceRole(ORDER_ID, 'paid', TX_HASH);

		expect(mockInsertOrderEvent).toHaveBeenCalledOnce();
		expect(mockInsertOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ORDER_ID,
				event_type: 'paid',
				tx_hash: TRACE_RESULT.txHash,
				payload: expect.objectContaining({ event: 'paid' }),
			}),
		);
	});

	it('still updates orders.status to "paid" and sets cardano_tx_hash', async () => {
		await updateOrderStatusWithServiceRole(ORDER_ID, 'paid', TX_HASH);

		expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', cardano_tx_hash: TX_HASH }));
		expect(mockEqUpdate).toHaveBeenCalledWith('id', ORDER_ID);
	});

	it('does NOT call submitPaidTrace for non-paid transitions (e.g. payment_failed)', async () => {
		await updateOrderStatusWithServiceRole(ORDER_ID, 'payment_failed');

		expect(mockSubmitPaidTrace).not.toHaveBeenCalled();
		expect(mockInsertOrderEvent).not.toHaveBeenCalled();
	});

	it('does NOT call submitPaidTrace for shipped transitions', async () => {
		await updateOrderStatusWithServiceRole(ORDER_ID, 'shipped');

		expect(mockSubmitPaidTrace).not.toHaveBeenCalled();
		expect(mockInsertOrderEvent).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Rollback / error path
// ---------------------------------------------------------------------------
describe('updateOrderStatusWithServiceRole — submitPaidTrace failure', () => {
	it('throws when submitPaidTrace throws', async () => {
		const chainError = new Error('ChainUnavailable: connection refused');
		mockSubmitPaidTrace.mockRejectedValueOnce(chainError);

		await expect(updateOrderStatusWithServiceRole(ORDER_ID, 'paid', TX_HASH)).rejects.toThrow(
			'ChainUnavailable: connection refused',
		);
	});

	it('does NOT update orders.status when submitPaidTrace throws', async () => {
		mockSubmitPaidTrace.mockRejectedValueOnce(new Error('ChainUnavailable'));

		await expect(updateOrderStatusWithServiceRole(ORDER_ID, 'paid', TX_HASH)).rejects.toThrow();

		// DB update must NOT have been called
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it('does NOT call insertOrderEvent when submitPaidTrace throws', async () => {
		mockSubmitPaidTrace.mockRejectedValueOnce(new Error('ChainUnavailable'));

		await expect(updateOrderStatusWithServiceRole(ORDER_ID, 'paid', TX_HASH)).rejects.toThrow();

		expect(mockInsertOrderEvent).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// insertOrderEvent failure
// ---------------------------------------------------------------------------
describe('updateOrderStatusWithServiceRole — insertOrderEvent failure', () => {
	it('throws when insertOrderEvent throws', async () => {
		mockInsertOrderEvent.mockRejectedValueOnce(new Error('DB insert failed'));

		await expect(updateOrderStatusWithServiceRole(ORDER_ID, 'paid', TX_HASH)).rejects.toThrow('DB insert failed');
	});
});
