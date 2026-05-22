import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Supabase client — shared builder chain fns
// ---------------------------------------------------------------------------
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		from: mockFrom,
	})),
}));

import { createClient } from '@supabase/supabase-js';
import type { BadgeKind } from '../badges-catalog.js';
import { BADGES_CATALOG, getCatalogEntry } from '../badges-catalog.js';

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Catalog structure tests
// ---------------------------------------------------------------------------
describe('BADGES_CATALOG', () => {
	it('contains two entries with unique kind_ids (1 and 2)', () => {
		const kinds = Object.keys(BADGES_CATALOG) as BadgeKind[];
		expect(kinds).toHaveLength(2);

		const kindIds = kinds.map(k => BADGES_CATALOG[k].kind_id);
		expect(kindIds).toContain(1);
		expect(kindIds).toContain(2);
		expect(new Set(kindIds).size).toBe(2);
	});

	it('each entry has a well-formed IPFS CID starting with ipfs://', () => {
		for (const entry of Object.values(BADGES_CATALOG)) {
			expect(entry.ipfs_image_cid).toMatch(/^ipfs:\/\//);
		}
	});

	it('buyer_first_purchase entry has recipient_role buyer', () => {
		const entry = BADGES_CATALOG.buyer_first_purchase;
		expect(entry.recipient_role).toBe('buyer');
		expect(entry.name).toBe('First Purchase');
		expect(entry.description).toContain('first purchase');
	});

	it('seller_first_delivery entry has recipient_role merchant', () => {
		const entry = BADGES_CATALOG.seller_first_delivery;
		expect(entry.recipient_role).toBe('merchant');
		expect(entry.name).toBe('First Delivery');
		expect(entry.description).toContain('first delivery');
	});
});

// ---------------------------------------------------------------------------
// getCatalogEntry
// ---------------------------------------------------------------------------
describe('getCatalogEntry', () => {
	it('returns buyer entry for buyer_first_purchase', () => {
		const entry = getCatalogEntry('buyer_first_purchase');
		expect(entry.recipient_role).toBe('buyer');
		expect(entry.kind_id).toBe(1);
	});

	it('returns seller entry for seller_first_delivery', () => {
		const entry = getCatalogEntry('seller_first_delivery');
		expect(entry.recipient_role).toBe('merchant');
		expect(entry.kind_id).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Eligibility predicates — buyer_first_purchase
// ---------------------------------------------------------------------------
describe('BUYER_FIRST_PURCHASE eligibility', () => {
	it('returns true when buyer has exactly 1 released escrow', async () => {
		const dbClient = createClient('https://test.supabase.co', 'key');

		// Step 1: fetch escrow to get buyer_pkh
		const mockEscrowSingle = vi.fn().mockResolvedValueOnce({
			data: { buyer_pkh: 'abc123', status: 'released' },
			error: null,
		});
		const mockEscrowEq = vi.fn(() => ({ single: mockEscrowSingle }));
		const mockEscrowSelect = vi.fn(() => ({ eq: mockEscrowEq }));

		// Step 2: count released escrows for this buyer
		const mockCountSingle = vi.fn().mockResolvedValueOnce({
			data: null,
			count: 1,
			error: null,
		});
		const mockCountEqBuyer = vi.fn(() => ({ single: mockCountSingle }));
		const mockCountEqStatus = vi.fn(() => ({ eq: mockCountEqBuyer }));
		const mockCountSelect = vi.fn(() => ({ eq: mockCountEqStatus }));

		let callIdx = 0;
		mockFrom.mockImplementation((_table: string) => {
			callIdx++;
			return {
				select: callIdx === 1 ? mockEscrowSelect : mockCountSelect,
			};
		});

		const result = await BADGES_CATALOG.buyer_first_purchase.eligibility('order-1', dbClient);

		expect(result).toBe(true);
		expect(mockFrom).toHaveBeenCalledWith('escrows');
	});

	it('returns false when buyer has 0 released escrows', async () => {
		const dbClient = createClient('https://test.supabase.co', 'key');

		const mockEscrowSingle = vi.fn().mockResolvedValueOnce({
			data: { buyer_pkh: 'abc123', status: 'released' },
			error: null,
		});
		const mockEscrowEq = vi.fn(() => ({ single: mockEscrowSingle }));
		const mockEscrowSelect = vi.fn(() => ({ eq: mockEscrowEq }));

		const mockCountSingle = vi.fn().mockResolvedValueOnce({
			data: null,
			count: 0,
			error: null,
		});
		const mockCountEqBuyer = vi.fn(() => ({ single: mockCountSingle }));
		const mockCountEqStatus = vi.fn(() => ({ eq: mockCountEqBuyer }));
		const mockCountSelect = vi.fn(() => ({ eq: mockCountEqStatus }));

		let callIdx = 0;
		mockFrom.mockImplementation((_table: string) => {
			callIdx++;
			return {
				select: callIdx === 1 ? mockEscrowSelect : mockCountSelect,
			};
		});

		const result = await BADGES_CATALOG.buyer_first_purchase.eligibility('order-1', dbClient);

		expect(result).toBe(false);
	});

	it('returns false when buyer has 2+ released escrows', async () => {
		const dbClient = createClient('https://test.supabase.co', 'key');

		const mockEscrowSingle = vi.fn().mockResolvedValueOnce({
			data: { buyer_pkh: 'abc123', status: 'released' },
			error: null,
		});
		const mockEscrowEq = vi.fn(() => ({ single: mockEscrowSingle }));
		const mockEscrowSelect = vi.fn(() => ({ eq: mockEscrowEq }));

		const mockCountSingle = vi.fn().mockResolvedValueOnce({
			data: null,
			count: 2,
			error: null,
		});
		const mockCountEqBuyer = vi.fn(() => ({ single: mockCountSingle }));
		const mockCountEqStatus = vi.fn(() => ({ eq: mockCountEqBuyer }));
		const mockCountSelect = vi.fn(() => ({ eq: mockCountEqStatus }));

		let callIdx = 0;
		mockFrom.mockImplementation((_table: string) => {
			callIdx++;
			return {
				select: callIdx === 1 ? mockEscrowSelect : mockCountSelect,
			};
		});

		const result = await BADGES_CATALOG.buyer_first_purchase.eligibility('order-1', dbClient);

		expect(result).toBe(false);
	});

	it('throws when escrow lookup fails', async () => {
		const dbClient = createClient('https://test.supabase.co', 'key');

		const mockEscrowSingle = vi.fn().mockResolvedValueOnce({
			data: null,
			error: { message: 'not found' },
		});
		const mockEscrowEq = vi.fn(() => ({ single: mockEscrowSingle }));
		const mockEscrowSelect = vi.fn(() => ({ eq: mockEscrowEq }));

		mockFrom.mockReturnValueOnce({ select: mockEscrowSelect });

		await expect(BADGES_CATALOG.buyer_first_purchase.eligibility('order-1', dbClient)).rejects.toThrow('not found');
	});
});

// ---------------------------------------------------------------------------
// Eligibility predicates — seller_first_delivery
// ---------------------------------------------------------------------------
describe('SELLER_FIRST_DELIVERY eligibility', () => {
	it('returns true when there is exactly 1 released escrow store-wide', async () => {
		const dbClient = createClient('https://test.supabase.co', 'key');

		const mockSingle = vi.fn().mockResolvedValueOnce({
			data: null,
			count: 1,
			error: null,
		});
		const mockEqStatus = vi.fn(() => ({ single: mockSingle }));
		const mockSelect = vi.fn(() => ({ eq: mockEqStatus }));

		mockFrom.mockReturnValueOnce({ select: mockSelect });

		const result = await BADGES_CATALOG.seller_first_delivery.eligibility('order-1', dbClient);

		expect(result).toBe(true);
		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockSelect).toHaveBeenCalledWith('*', {
			count: 'exact',
			head: true,
		});
		expect(mockEqStatus).toHaveBeenCalledWith('status', 'released');
	});

	it('returns false when there are 0 released escrows', async () => {
		const dbClient = createClient('https://test.supabase.co', 'key');

		const mockSingle = vi.fn().mockResolvedValueOnce({
			data: null,
			count: 0,
			error: null,
		});
		const mockEqStatus = vi.fn(() => ({ single: mockSingle }));
		const mockSelect = vi.fn(() => ({ eq: mockEqStatus }));

		mockFrom.mockReturnValueOnce({ select: mockSelect });

		const result = await BADGES_CATALOG.seller_first_delivery.eligibility('order-2', dbClient);

		expect(result).toBe(false);
	});

	it('returns false when there are 2+ released escrows', async () => {
		const dbClient = createClient('https://test.supabase.co', 'key');

		const mockSingle = vi.fn().mockResolvedValueOnce({
			data: null,
			count: 3,
			error: null,
		});
		const mockEqStatus = vi.fn(() => ({ single: mockSingle }));
		const mockSelect = vi.fn(() => ({ eq: mockEqStatus }));

		mockFrom.mockReturnValueOnce({ select: mockSelect });

		const result = await BADGES_CATALOG.seller_first_delivery.eligibility('order-3', dbClient);

		expect(result).toBe(false);
	});

	it('throws when count query errors', async () => {
		const dbClient = createClient('https://test.supabase.co', 'key');

		const mockSingle = vi.fn().mockResolvedValueOnce({
			data: null,
			count: null,
			error: { message: 'db down' },
		});
		const mockEqStatus = vi.fn(() => ({ single: mockSingle }));
		const mockSelect = vi.fn(() => ({ eq: mockEqStatus }));

		mockFrom.mockReturnValueOnce({ select: mockSelect });

		await expect(BADGES_CATALOG.seller_first_delivery.eligibility('order-4', dbClient)).rejects.toThrow('db down');
	});
});
