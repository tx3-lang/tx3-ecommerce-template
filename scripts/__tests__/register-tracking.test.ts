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
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared Supabase mock fns
//
// The script does (two separate `from()` calls):
//   supabase.from('orders').select('id').eq('id', orderId).single()
//   supabase.from('orders').update({ carrier, tracking_number }).eq('id', orderId)
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
// Tracking update (inline orders UPDATE)
// ---------------------------------------------------------------------------
describe('tracking update', () => {
	it('updates the orders row with carrier + tracking_number', async () => {
		await main(['--order-id', ORDER_ID, '--carrier', CARRIER, '--tracking', TRACKING]);

		expect(mockUpdate).toHaveBeenCalledOnce();
		expect(mockUpdate).toHaveBeenCalledWith({ carrier: CARRIER, tracking_number: TRACKING });
		expect(mockEqUpdate).toHaveBeenCalledWith('id', ORDER_ID);
	});

	it('throws DB_UPDATE_FAILED when the update errors', async () => {
		mockEqUpdate.mockResolvedValueOnce({ error: { message: 'boom' } });

		await expect(
			main(['--order-id', ORDER_ID, '--carrier', CARRIER, '--tracking', TRACKING]),
		).rejects.toThrow('DB_UPDATE_FAILED');
	});

	it('writes ONLY the orders table — never order_events or escrows', async () => {
		await main(['--order-id', ORDER_ID, '--carrier', CARRIER, '--tracking', TRACKING]);

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
