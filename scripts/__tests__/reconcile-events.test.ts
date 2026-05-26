/**
 * Tests for scripts/reconcile-events.ts
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js       — Supabase client (order_events SELECT)
 *   - @/lib/cardano/u5c-client    — createU5cClient / checkStatus
 *   - @/lib/cardano/network       — getNetworkConfig
 *   - @/server-fns/order-events   — markEventConfirmed
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock
// Reads: supabase.from('order_events').select('*').is('confirmed_at', null)
// ---------------------------------------------------------------------------

const mockIs = vi.fn();
const mockSelect = vi.fn(() => ({ is: mockIs }));
const mockFrom = vi.fn((_table: string) => ({ select: mockSelect }));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({ from: mockFrom })),
}));

// ---------------------------------------------------------------------------
// Mock: createU5cClient / checkStatus
// ---------------------------------------------------------------------------
const mockCheckStatus = vi.fn();
const mockCreateU5cClient = vi.fn(() => ({ checkStatus: mockCheckStatus }));

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
// Mock: markEventConfirmed
// ---------------------------------------------------------------------------
const mockMarkEventConfirmed = vi.fn();

vi.mock('@/server-fns/order-events', () => ({
	insertOrderEvent: vi.fn(),
	listOrderEvents: vi.fn(),
	markEventConfirmed: mockMarkEventConfirmed,
}));

// ---------------------------------------------------------------------------
// Env setup (service-role Supabase client)
// ---------------------------------------------------------------------------
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'service-role-secret';

// ---------------------------------------------------------------------------
// Import module under test (AFTER mocks are registered — vi.mock is hoisted)
// ---------------------------------------------------------------------------
const { main } = await import('../reconcile-events.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const STUB_CONFIG = {
	trpEndpoint: 'https://preview.trp.example.com',
	profile: 'preview' as const,
	metadataLabel: 1337,
	merchantAddress: 'addr1qtest_merchant',
};

const EVENT_1: Database.OrderEvent = {
	id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	order_id: 'ord-1111',
	event_type: 'paid',
	tx_hash: 'hash_confirmed_1',
	payload: { v: 1 },
	submitted_at: '2026-05-22T00:00:00Z',
	confirmed_at: null,
};

const EVENT_2: Database.OrderEvent = {
	id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	order_id: 'ord-2222',
	event_type: 'shipped',
	tx_hash: 'hash_pending_2',
	payload: { v: 1 },
	submitted_at: '2026-05-22T01:00:00Z',
	confirmed_at: null,
};

const EVENT_3: Database.OrderEvent = {
	id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
	order_id: 'ord-3333',
	event_type: 'completed',
	tx_hash: 'hash_finalized_3',
	payload: { v: 1 },
	submitted_at: '2026-05-22T02:00:00Z',
	confirmed_at: null,
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetNetworkConfig.mockReturnValue(STUB_CONFIG);
	mockMarkEventConfirmed.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Empty result — no pending rows
// ---------------------------------------------------------------------------
describe('no pending events', () => {
	it('returns zero confirmed, zero pending, zero errors when table is empty', async () => {
		mockIs.mockResolvedValueOnce({ data: [], error: null });

		const result = await main();

		expect(result.confirmed).toBe(0);
		expect(result.stillPending).toBe(0);
		expect(result.errors).toBe(0);
	});

	it('does NOT call checkStatus when there are no pending rows', async () => {
		mockIs.mockResolvedValueOnce({ data: [], error: null });

		await main();

		expect(mockCheckStatus).not.toHaveBeenCalled();
	});

	it('does NOT call markEventConfirmed when there are no pending rows', async () => {
		mockIs.mockResolvedValueOnce({ data: [], error: null });

		await main();

		expect(mockMarkEventConfirmed).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Supabase query shape
// ---------------------------------------------------------------------------
describe('Supabase query', () => {
	it('queries order_events with confirmed_at IS NULL', async () => {
		mockIs.mockResolvedValueOnce({ data: [], error: null });

		await main();

		expect(mockFrom).toHaveBeenCalledWith('order_events');
		expect(mockSelect).toHaveBeenCalledWith('*');
		expect(mockIs).toHaveBeenCalledWith('confirmed_at', null);
	});

	it('throws when Supabase returns an error', async () => {
		mockIs.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

		await expect(main()).rejects.toThrow('DB error');
	});
});

// ---------------------------------------------------------------------------
// checkStatus call
// ---------------------------------------------------------------------------
describe('checkStatus call', () => {
	it('calls checkStatus with all tx_hash values from pending rows', async () => {
		mockIs.mockResolvedValueOnce({ data: [EVENT_1, EVENT_2], error: null });
		mockCheckStatus.mockResolvedValueOnce({
			statuses: {
				hash_confirmed_1: { stage: 'confirmed', confirmations: 5, nonConfirmations: 0 },
				hash_pending_2: { stage: 'pending', confirmations: 0, nonConfirmations: 1 },
			},
		});

		await main();

		expect(mockCheckStatus).toHaveBeenCalledOnce();
		expect(mockCheckStatus).toHaveBeenCalledWith(
			expect.arrayContaining(['hash_confirmed_1', 'hash_pending_2']),
		);
	});
});

// ---------------------------------------------------------------------------
// markEventConfirmed — only called for confirmed/finalized stages
// ---------------------------------------------------------------------------
describe('markEventConfirmed', () => {
	it('calls markEventConfirmed for a tx with stage "confirmed"', async () => {
		mockIs.mockResolvedValueOnce({ data: [EVENT_1], error: null });
		mockCheckStatus.mockResolvedValueOnce({
			statuses: {
				hash_confirmed_1: { stage: 'confirmed', confirmations: 5, nonConfirmations: 0 },
			},
		});

		await main();

		expect(mockMarkEventConfirmed).toHaveBeenCalledOnce();
		expect(mockMarkEventConfirmed).toHaveBeenCalledWith(EVENT_1.id);
	});

	it('calls markEventConfirmed for a tx with stage "finalized"', async () => {
		mockIs.mockResolvedValueOnce({ data: [EVENT_3], error: null });
		mockCheckStatus.mockResolvedValueOnce({
			statuses: {
				hash_finalized_3: { stage: 'finalized', confirmations: 20, nonConfirmations: 0 },
			},
		});

		await main();

		expect(mockMarkEventConfirmed).toHaveBeenCalledOnce();
		expect(mockMarkEventConfirmed).toHaveBeenCalledWith(EVENT_3.id);
	});

	it('does NOT call markEventConfirmed for a tx with stage "pending"', async () => {
		mockIs.mockResolvedValueOnce({ data: [EVENT_2], error: null });
		mockCheckStatus.mockResolvedValueOnce({
			statuses: {
				hash_pending_2: { stage: 'pending', confirmations: 0, nonConfirmations: 1 },
			},
		});

		await main();

		expect(mockMarkEventConfirmed).not.toHaveBeenCalled();
	});

	it('does NOT call markEventConfirmed for a tx with stage "dropped"', async () => {
		mockIs.mockResolvedValueOnce({ data: [EVENT_2], error: null });
		mockCheckStatus.mockResolvedValueOnce({
			statuses: {
				hash_pending_2: { stage: 'dropped', confirmations: 0, nonConfirmations: 3 },
			},
		});

		await main();

		expect(mockMarkEventConfirmed).not.toHaveBeenCalled();
	});

	it('does NOT call markEventConfirmed for a tx whose hash is absent from statuses', async () => {
		mockIs.mockResolvedValueOnce({ data: [EVENT_2], error: null });
		mockCheckStatus.mockResolvedValueOnce({ statuses: {} });

		await main();

		expect(mockMarkEventConfirmed).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Summary counts
// ---------------------------------------------------------------------------
describe('summary counts', () => {
	it('returns correct confirmed/stillPending counts for a mixed batch', async () => {
		mockIs.mockResolvedValueOnce({ data: [EVENT_1, EVENT_2, EVENT_3], error: null });
		mockCheckStatus.mockResolvedValueOnce({
			statuses: {
				hash_confirmed_1: { stage: 'confirmed', confirmations: 5, nonConfirmations: 0 },
				hash_pending_2: { stage: 'pending', confirmations: 0, nonConfirmations: 1 },
				hash_finalized_3: { stage: 'finalized', confirmations: 20, nonConfirmations: 0 },
			},
		});

		const result = await main();

		expect(result.confirmed).toBe(2);
		expect(result.stillPending).toBe(1);
		expect(result.errors).toBe(0);
	});

	it('counts errors when markEventConfirmed throws', async () => {
		mockIs.mockResolvedValueOnce({ data: [EVENT_1, EVENT_3], error: null });
		mockCheckStatus.mockResolvedValueOnce({
			statuses: {
				hash_confirmed_1: { stage: 'confirmed', confirmations: 5, nonConfirmations: 0 },
				hash_finalized_3: { stage: 'finalized', confirmations: 20, nonConfirmations: 0 },
			},
		});
		mockMarkEventConfirmed
			.mockResolvedValueOnce(undefined) // EVENT_1 succeeds
			.mockRejectedValueOnce(new Error('DB write failed')); // EVENT_3 fails

		const result = await main();

		expect(result.confirmed).toBe(1);
		expect(result.errors).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Chain unavailable — throws and propagates
// ---------------------------------------------------------------------------
describe('chain unavailable', () => {
	it('throws when checkStatus throws ChainUnavailable', async () => {
		mockIs.mockResolvedValueOnce({ data: [EVENT_1], error: null });
		mockCheckStatus.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main()).rejects.toThrow('ChainUnavailable');
	});
});
