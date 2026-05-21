/**
 * Tests for src/server-fns/order-events.ts
 *
 * All Supabase interactions are mocked at the module boundary.
 * No real DB connection is made.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock fns — created before vi.mock so the factory closure captures them
// ---------------------------------------------------------------------------
const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockInsert = vi.fn(() => ({ select: mockSelect }));
const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) }));
const mockOrder = vi.fn();
const mockEq = vi.fn();

// mockFrom returns different builder chains depending on the method called.
// Typed as () => unknown so individual tests can mockReturnValueOnce with
// shapes that don't match the default builder (e.g. listOrderEvents uses a
// deeper select().eq().order() chain than the default).
const mockFrom = vi.fn<(table: string) => unknown>((table: string) => {
	void table;
	return {
		insert: mockInsert,
		update: mockUpdate,
		select: vi.fn(() => ({
			eq: mockEq,
			order: mockOrder,
		})),
	};
});

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		from: mockFrom,
	})),
}));

// Provide required env vars before the module resolves
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'service-role-secret';

// Import the helpers AFTER mocking
const { insertOrderEvent, listOrderEvents, markEventConfirmed } = await import('../order-events.js');

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------
const SAMPLE_EVENT: Database.OrderEvent = {
	id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
	order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	event_type: 'paid',
	tx_hash: 'deadbeef',
	payload: { v: 1, event: 'paid' },
	submitted_at: '2026-05-21T00:00:00Z',
	confirmed_at: null,
};

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// insertOrderEvent
// ---------------------------------------------------------------------------
describe('insertOrderEvent', () => {
	it('inserts a row with the expected shape and returns the created event', async () => {
		mockSingle.mockResolvedValueOnce({ data: SAMPLE_EVENT, error: null });

		const result = await insertOrderEvent({
			order_id: SAMPLE_EVENT.order_id,
			event_type: SAMPLE_EVENT.event_type,
			tx_hash: SAMPLE_EVENT.tx_hash,
			payload: SAMPLE_EVENT.payload,
		});

		// Verify that from('order_events') was called
		expect(mockFrom).toHaveBeenCalledWith('order_events');

		// Verify insert was called with matching fields
		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: SAMPLE_EVENT.order_id,
				event_type: SAMPLE_EVENT.event_type,
				tx_hash: SAMPLE_EVENT.tx_hash,
				payload: SAMPLE_EVENT.payload,
			}),
		);

		// Verify the returned value matches the DB row
		expect(result).toEqual(SAMPLE_EVENT);
	});

	it('throws a typed DUPLICATE_EVENT error on unique-constraint violation (23505)', async () => {
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { code: '23505', message: 'duplicate key value' },
		});

		await expect(
			insertOrderEvent({
				order_id: SAMPLE_EVENT.order_id,
				event_type: SAMPLE_EVENT.event_type,
				tx_hash: SAMPLE_EVENT.tx_hash,
				payload: SAMPLE_EVENT.payload,
			}),
		).rejects.toThrow(`DUPLICATE_EVENT: order_id=${SAMPLE_EVENT.order_id}, event_type=${SAMPLE_EVENT.event_type}`);
	});

	it('throws a generic error for non-duplicate Supabase errors', async () => {
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { code: '42P01', message: 'relation "order_events" does not exist' },
		});

		await expect(
			insertOrderEvent({
				order_id: SAMPLE_EVENT.order_id,
				event_type: SAMPLE_EVENT.event_type,
				tx_hash: SAMPLE_EVENT.tx_hash,
				payload: SAMPLE_EVENT.payload,
			}),
		).rejects.toThrow('relation "order_events" does not exist');
	});
});

// ---------------------------------------------------------------------------
// listOrderEvents
// ---------------------------------------------------------------------------
describe('listOrderEvents', () => {
	it('returns events ordered by submitted_at ascending', async () => {
		const events = [
			{ ...SAMPLE_EVENT, id: 'evt-1', submitted_at: '2026-05-21T01:00:00Z' },
			{ ...SAMPLE_EVENT, id: 'evt-2', submitted_at: '2026-05-21T02:00:00Z' },
		];

		// listOrderEvents calls: from('order_events').select('*').eq(...).order(...)
		// We need to build the chain that resolves with the events list
		const mockOrderResolved = vi.fn().mockResolvedValueOnce({ data: events, error: null });
		const mockEqChained = vi.fn(() => ({ order: mockOrderResolved }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: mockUpdate,
			select: mockSelectChained,
		});

		const result = await listOrderEvents(SAMPLE_EVENT.order_id);

		expect(mockFrom).toHaveBeenCalledWith('order_events');
		expect(mockEqChained).toHaveBeenCalledWith('order_id', SAMPLE_EVENT.order_id);
		expect(mockOrderResolved).toHaveBeenCalledWith('submitted_at', { ascending: true });
		expect(result).toEqual(events);
	});

	it('returns an empty array when no events exist for the order', async () => {
		const mockOrderResolved = vi.fn().mockResolvedValueOnce({ data: [], error: null });
		const mockEqChained = vi.fn(() => ({ order: mockOrderResolved }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: mockUpdate,
			select: mockSelectChained,
		});

		const result = await listOrderEvents('no-events-order-id');
		expect(result).toEqual([]);
	});

	it('throws when Supabase returns an error', async () => {
		const mockOrderResolved = vi.fn().mockResolvedValueOnce({
			data: null,
			error: { code: '42P01', message: 'table not found' },
		});
		const mockEqChained = vi.fn(() => ({ order: mockOrderResolved }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: mockUpdate,
			select: mockSelectChained,
		});

		await expect(listOrderEvents(SAMPLE_EVENT.order_id)).rejects.toThrow('table not found');
	});
});

// ---------------------------------------------------------------------------
// markEventConfirmed
// ---------------------------------------------------------------------------
describe('markEventConfirmed', () => {
	it('calls update on order_events with confirmed_at and matches by id', async () => {
		const mockEqUpdate = vi.fn().mockResolvedValueOnce({ error: null });
		const mockUpdateChained = vi.fn(() => ({ eq: mockEqUpdate }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: mockUpdateChained,
			select: vi.fn(),
		});

		await markEventConfirmed('evt-123');

		expect(mockFrom).toHaveBeenCalledWith('order_events');
		expect(mockUpdateChained).toHaveBeenCalledWith(expect.objectContaining({ confirmed_at: expect.any(String) }));
		expect(mockEqUpdate).toHaveBeenCalledWith('id', 'evt-123');
	});

	it('throws when Supabase returns an error', async () => {
		const mockEqUpdate = vi.fn().mockResolvedValueOnce({ error: { message: 'update failed' } });
		const mockUpdateChained = vi.fn(() => ({ eq: mockEqUpdate }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: mockUpdateChained,
			select: vi.fn(),
		});

		await expect(markEventConfirmed('evt-bad')).rejects.toThrow('update failed');
	});
});
