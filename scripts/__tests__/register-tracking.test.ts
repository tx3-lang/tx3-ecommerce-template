/**
 * Tests for scripts/register-tracking.ts
 *
 * Tests the `main(args)` function extracted from the CLI entry point.
 *
 * Scope note: register-tracking owns ONLY the carrier + tracking_number
 * columns on the `orders` table. It does not write orders.status,
 * order_events, or escrows, so this suite asserts only the orders UPDATE
 * and the absence of any order_events / escrows writes.
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js     — Supabase client (orders SELECT, orders UPDATE)
 *   - @/server-fns/orders       — setOrderTracking
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared Supabase mock fns
//
// The script does (two separate `from()` calls):
//   supabase.from('orders').select('id').eq('id', orderId).single()
//   (setOrderTracking) supabase.from('orders').update({...}).eq('id', orderId)
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();
// SELECT chain: .select('id').eq(...).single()
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
// Mock: setOrderTracking
// ---------------------------------------------------------------------------
const mockSetOrderTracking = vi.fn();

vi.mock('@/server-fns/orders', () => ({
	setOrderTracking: mockSetOrderTracking,
}));

// ---------------------------------------------------------------------------
// Env setup (service-role Supabase client)
// ---------------------------------------------------------------------------
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'service-role-secret';

// ---------------------------------------------------------------------------
// Import module under test (AFTER mocks are registered — vi.mock is hoisted)
// ---------------------------------------------------------------------------
const { main } = await import('../register-tracking.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CARRIER = 'fedex';
const TRACKING = '1Z999AA10123456784';

const STUB_ORDER_ROW = { id: ORDER_ID };

beforeEach(() => {
	vi.clearAllMocks();

	// Default happy-path stubs
	mockSingle.mockResolvedValue({ data: STUB_ORDER_ROW, error: null });
	mockSetOrderTracking.mockResolvedValue(undefined);
	mockEqUpdate.mockResolvedValue({ error: null });
});

// ---------------------------------------------------------------------------
// Arg parsing — missing args
// ---------------------------------------------------------------------------
describe('arg parsing', () => {
	it('rejects missing --order-id with MISSING_ARG error', async () => {
		await expect(main(['--carrier', CARRIER, '--tracking', TRACKING])).rejects.toThrow(
			'MISSING_ARG: --order-id is required',
		);
	});

	it('rejects missing --carrier with MISSING_ARG error', async () => {
		await expect(main(['--order-id', ORDER_ID, '--tracking', TRACKING])).rejects.toThrow(
			'MISSING_ARG: --carrier is required',
		);
	});

	it('rejects missing --tracking with MISSING_ARG error', async () => {
		await expect(main(['--order-id', ORDER_ID, '--carrier', CARRIER])).rejects.toThrow(
			'MISSING_ARG: --tracking is required',
		);
	});

	it('accepts all three args without throwing', async () => {
		await expect(main(['--order-id', ORDER_ID, '--carrier', CARRIER, '--tracking', TRACKING])).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Order existence check
// ---------------------------------------------------------------------------
describe('order existence check', () => {
	it('queries the orders table for the given order_id', async () => {
		await main(['--order-id', ORDER_ID, '--carrier', CARRIER, '--tracking', TRACKING]);

		expect(mockFrom).toHaveBeenCalledWith('orders');
		expect(mockSelect).toHaveBeenCalledWith('id');
		expect(mockEqSelect).toHaveBeenCalledWith('id', ORDER_ID);
		expect(mockSingle).toHaveBeenCalled();
	});

	it('aborts with ORDER_NOT_FOUND when Supabase returns a fetch error', async () => {
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { message: 'not found', code: 'PGRST116' },
		});

		await expect(
			main(['--order-id', ORDER_ID, '--carrier', CARRIER, '--tracking', TRACKING]),
		).rejects.toThrow('ORDER_NOT_FOUND');
	});

	it('aborts with ORDER_NOT_FOUND when Supabase returns no data row', async () => {
		mockSingle.mockResolvedValueOnce({ data: null, error: null });

		await expect(
			main(['--order-id', ORDER_ID, '--carrier', CARRIER, '--tracking', TRACKING]),
		).rejects.toThrow('ORDER_NOT_FOUND');
	});
});

// ---------------------------------------------------------------------------
// setOrderTracking call
// ---------------------------------------------------------------------------
describe('setOrderTracking', () => {
	it('calls setOrderTracking with orderId, carrier, trackingNumber', async () => {
		await main(['--order-id', ORDER_ID, '--carrier', CARRIER, '--tracking', TRACKING]);

		expect(mockSetOrderTracking).toHaveBeenCalledOnce();
		expect(mockSetOrderTracking).toHaveBeenCalledWith(ORDER_ID, CARRIER, TRACKING);
	});

	it('does NOT write orders.status nor order_events (owned by traceability)', async () => {
		await main(['--order-id', ORDER_ID, '--carrier', CARRIER, '--tracking', TRACKING]);

		// The supabase client should only be used for the existence check (orders SELECT)
		// The update goes through setOrderTracking (mocked), so no direct mockUpdate calls
		expect(mockUpdate).not.toHaveBeenCalled();
		expect(mockFrom).not.toHaveBeenCalledWith('order_events');
		expect(mockFrom).not.toHaveBeenCalledWith('escrows');
	});
});

// ---------------------------------------------------------------------------
// Return value (happy path)
// ---------------------------------------------------------------------------
describe('return value', () => {
	it('returns orderId, carrier, and trackingNumber on success', async () => {
		const result = await main(['--order-id', ORDER_ID, '--carrier', CARRIER, '--tracking', TRACKING]);

		expect(result).toEqual({
			orderId: ORDER_ID,
			carrier: CARRIER,
			trackingNumber: TRACKING,
		});
	});
});
