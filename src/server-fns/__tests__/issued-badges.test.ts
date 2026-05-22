/**
 * Tests for src/server-fns/issued-badges.ts
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
const mockOrder = vi.fn();
const mockEq = vi.fn();

const mockFrom = vi.fn<(table: string) => unknown>((table: string) => {
	void table;
	return {
		insert: mockInsert,
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

process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'service-role-secret';

const { insertIssuedBadge, listBadgesByRecipient, listBadgesByOrder } = await import('../issued-badges.js');

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------
const SAMPLE_BADGE: Database.IssuedBadge = {
	id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	kind: 'buyer_first_purchase',
	recipient_pkh: 'pkh_abc123',
	recipient_address: 'addr_test1_abc123',
	triggering_order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	policy_id: 'policy_xyz',
	asset_name_hex: 'abcdef01',
	mint_tx_hash: 'tx_mint_abc123',
	metadata: { badge: 'test', level: 1 },
	minted_at: '2026-05-22T00:00:00Z',
};

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// insertIssuedBadge
// ---------------------------------------------------------------------------
describe('insertIssuedBadge', () => {
	it('inserts a row and returns the created badge', async () => {
		mockSingle.mockResolvedValueOnce({ data: SAMPLE_BADGE, error: null });

		const result = await insertIssuedBadge({
			kind: 'buyer_first_purchase',
			recipient_pkh: 'pkh_abc123',
			recipient_address: 'addr_test1_abc123',
			triggering_order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			policy_id: 'policy_xyz',
			asset_name_hex: 'abcdef01',
			mint_tx_hash: 'tx_mint_abc123',
			metadata: { badge: 'test', level: 1 },
		});

		expect(mockFrom).toHaveBeenCalledWith('issued_badges');
		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'buyer_first_purchase',
				recipient_pkh: 'pkh_abc123',
				recipient_address: 'addr_test1_abc123',
				triggering_order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				policy_id: 'policy_xyz',
				asset_name_hex: 'abcdef01',
				mint_tx_hash: 'tx_mint_abc123',
				metadata: { badge: 'test', level: 1 },
			}),
		);
		expect(result).toEqual(SAMPLE_BADGE);
	});

	it('throws BADGE_ALREADY_ISSUED with existing mint_tx_hash on unique constraint violation', async () => {
		// First from() call: the insert chain that fails with 23505
		const mockInsertSingle = vi.fn().mockResolvedValueOnce({
			data: null,
			error: { code: '23505', message: 'duplicate key value violates unique constraint' },
		});
		const mockInsertSelectFn = vi.fn(() => ({ single: mockInsertSingle }));
		const mockInsertFn = vi.fn(() => ({ select: mockInsertSelectFn }));

		// Second from() call: query for existing mint_tx_hash
		const mockSelectSingle = vi.fn().mockResolvedValueOnce({
			data: { mint_tx_hash: 'existing_hash_abc456' },
			error: null,
		});
		const mockSelectEq2 = vi.fn(() => ({ single: mockSelectSingle }));
		const mockSelectEq1 = vi.fn(() => ({ eq: mockSelectEq2 }));
		const mockSelectFn = vi.fn(() => ({ eq: mockSelectEq1 }));

		mockFrom
			.mockReturnValueOnce({ insert: mockInsertFn, select: vi.fn() })
			.mockReturnValueOnce({ insert: vi.fn(), select: mockSelectFn });

		await expect(
			insertIssuedBadge({
				kind: 'buyer_first_purchase',
				recipient_pkh: 'pkh_abc123',
				recipient_address: 'addr_test1_abc123',
				triggering_order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				policy_id: 'policy_xyz',
				asset_name_hex: 'abcdef01',
				mint_tx_hash: 'tx_mint_abc123',
				metadata: { badge: 'test' },
			}),
		).rejects.toThrow(
			'BADGE_ALREADY_ISSUED: kind=buyer_first_purchase, recipient_pkh=pkh_abc123, mint_tx_hash=existing_hash_abc456',
		);

		expect(mockFrom).toHaveBeenCalledTimes(2);
	});

	it('throws a generic error for non-duplicate Supabase errors', async () => {
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { code: '42P01', message: 'relation "issued_badges" does not exist' },
		});

		await expect(
			insertIssuedBadge({
				kind: 'seller_first_delivery',
				recipient_pkh: 'pkh_def',
				recipient_address: 'addr_test1_def',
				triggering_order_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
				policy_id: 'policy_123',
				asset_name_hex: 'deadbeef',
				mint_tx_hash: 'tx_mint_def',
				metadata: {},
			}),
		).rejects.toThrow('relation "issued_badges" does not exist');
	});
});

// ---------------------------------------------------------------------------
// listBadgesByRecipient
// ---------------------------------------------------------------------------
describe('listBadgesByRecipient', () => {
	it('returns badges ordered by minted_at descending', async () => {
		const badges = [
			{ ...SAMPLE_BADGE, id: 'badge-1', minted_at: '2026-05-22T02:00:00Z' },
			{ ...SAMPLE_BADGE, id: 'badge-2', minted_at: '2026-05-22T01:00:00Z' },
		];

		const mockOrderResolved = vi.fn().mockResolvedValueOnce({ data: badges, error: null });
		const mockEqChained = vi.fn(() => ({ order: mockOrderResolved }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			select: mockSelectChained,
		});

		const result = await listBadgesByRecipient('addr_test1_abc123');

		expect(mockFrom).toHaveBeenCalledWith('issued_badges');
		expect(mockEqChained).toHaveBeenCalledWith('recipient_address', 'addr_test1_abc123');
		expect(mockOrderResolved).toHaveBeenCalledWith('minted_at', { ascending: false });
		expect(result).toEqual(badges);
	});

	it('returns an empty array when no badges exist for the address', async () => {
		const mockOrderResolved = vi.fn().mockResolvedValueOnce({ data: [], error: null });
		const mockEqChained = vi.fn(() => ({ order: mockOrderResolved }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			select: mockSelectChained,
		});

		const result = await listBadgesByRecipient('no-badges-addr');
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
			select: mockSelectChained,
		});

		await expect(listBadgesByRecipient('bad-addr')).rejects.toThrow('table not found');
	});
});

// ---------------------------------------------------------------------------
// listBadgesByOrder
// ---------------------------------------------------------------------------
describe('listBadgesByOrder', () => {
	it('returns badges linked via triggering_order_id ordered by minted_at ascending', async () => {
		const badges = [
			{ ...SAMPLE_BADGE, id: 'badge-a', minted_at: '2026-05-22T01:00:00Z', triggering_order_id: 'order-xyz' },
			{ ...SAMPLE_BADGE, id: 'badge-b', minted_at: '2026-05-22T02:00:00Z', triggering_order_id: 'order-xyz' },
		];

		const mockOrderResolved = vi.fn().mockResolvedValueOnce({ data: badges, error: null });
		const mockEqChained = vi.fn(() => ({ order: mockOrderResolved }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			select: mockSelectChained,
		});

		const result = await listBadgesByOrder('order-xyz');

		expect(mockFrom).toHaveBeenCalledWith('issued_badges');
		expect(mockEqChained).toHaveBeenCalledWith('triggering_order_id', 'order-xyz');
		expect(mockOrderResolved).toHaveBeenCalledWith('minted_at', { ascending: true });
		expect(result).toEqual(badges);
	});

	it('returns an empty array when no badges exist for the order', async () => {
		const mockOrderResolved = vi.fn().mockResolvedValueOnce({ data: [], error: null });
		const mockEqChained = vi.fn(() => ({ order: mockOrderResolved }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			select: mockSelectChained,
		});

		const result = await listBadgesByOrder('empty-order');
		expect(result).toEqual([]);
	});

	it('throws when Supabase returns an error', async () => {
		const mockOrderResolved = vi.fn().mockResolvedValueOnce({
			data: null,
			error: { code: '42P01', message: 'table issue' },
		});
		const mockEqChained = vi.fn(() => ({ order: mockOrderResolved }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			select: mockSelectChained,
		});

		await expect(listBadgesByOrder('bad-order')).rejects.toThrow('table issue');
	});
});
