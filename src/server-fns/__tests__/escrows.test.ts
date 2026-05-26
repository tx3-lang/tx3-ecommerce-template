/**
 * Tests for src/server-fns/escrows.ts
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
const mockEq = vi.fn();

// mockFrom returns different builder chains depending on the method called.
const mockFrom = vi.fn<(table: string) => unknown>((table: string) => {
	void table;
	return {
		insert: mockInsert,
		update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
		select: vi.fn(() => ({
			eq: mockEq,
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
const { insertEscrow, getEscrowByOrderId, updateEscrowState } = await import('../escrows.js');

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------
const SAMPLE_ESCROW: Database.Escrow = {
	id: 'esc00000-0000-0000-0000-000000000000',
	order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	script_address: 'addr_test1qztest',
	utxo_tx_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
	utxo_output_index: 0,
	status: 'pending',
	buyer_pkh: 'buyerpkh123',
	merchant_pkh: 'merchantpkh456',
	paid_at: '2026-05-21T00:00:00Z',
	ship_deadline: '2026-05-28T00:00:00Z',
	grace_period_end: null,
	datum_cbor: 'd87980',
	shipped_tx_hash: null,
	release_tx_hash: null,
	refund_tx_hash: null,
	created_at: '2026-05-21T00:00:00Z',
	updated_at: '2026-05-21T00:00:00Z',
};

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// insertEscrow
// ---------------------------------------------------------------------------
describe('insertEscrow', () => {
	it('inserts a row with the expected shape and returns the created escrow', async () => {
		mockSingle.mockResolvedValueOnce({ data: SAMPLE_ESCROW, error: null });

		const result = await insertEscrow({
			order_id: SAMPLE_ESCROW.order_id,
			script_address: SAMPLE_ESCROW.script_address,
			utxo_tx_hash: SAMPLE_ESCROW.utxo_tx_hash,
			utxo_output_index: SAMPLE_ESCROW.utxo_output_index,
			status: SAMPLE_ESCROW.status,
			buyer_pkh: SAMPLE_ESCROW.buyer_pkh,
			merchant_pkh: SAMPLE_ESCROW.merchant_pkh,
			paid_at: SAMPLE_ESCROW.paid_at,
			ship_deadline: SAMPLE_ESCROW.ship_deadline,
			datum_cbor: SAMPLE_ESCROW.datum_cbor,
		});

		// Verify that from('escrows') was called
		expect(mockFrom).toHaveBeenCalledWith('escrows');

		// Verify insert was called with matching fields
		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: SAMPLE_ESCROW.order_id,
				script_address: SAMPLE_ESCROW.script_address,
				utxo_tx_hash: SAMPLE_ESCROW.utxo_tx_hash,
				utxo_output_index: SAMPLE_ESCROW.utxo_output_index,
				buyer_pkh: SAMPLE_ESCROW.buyer_pkh,
				merchant_pkh: SAMPLE_ESCROW.merchant_pkh,
			}),
		);

		// Verify the returned value matches the DB row
		expect(result).toEqual(SAMPLE_ESCROW);
	});

	it('throws a typed DUPLICATE_ESCROW error on unique-constraint violation (23505)', async () => {
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { code: '23505', message: 'duplicate key value' },
		});

		await expect(
			insertEscrow({
				order_id: SAMPLE_ESCROW.order_id,
				script_address: SAMPLE_ESCROW.script_address,
				utxo_tx_hash: SAMPLE_ESCROW.utxo_tx_hash,
				utxo_output_index: SAMPLE_ESCROW.utxo_output_index,
				status: SAMPLE_ESCROW.status,
				buyer_pkh: SAMPLE_ESCROW.buyer_pkh,
				merchant_pkh: SAMPLE_ESCROW.merchant_pkh,
				paid_at: SAMPLE_ESCROW.paid_at,
				ship_deadline: SAMPLE_ESCROW.ship_deadline,
				datum_cbor: SAMPLE_ESCROW.datum_cbor,
			}),
		).rejects.toThrow(`DUPLICATE_ESCROW: order_id=${SAMPLE_ESCROW.order_id}`);
	});

	it('throws a generic error for non-duplicate Supabase errors', async () => {
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { code: '42P01', message: 'relation "escrows" does not exist' },
		});

		await expect(
			insertEscrow({
				order_id: SAMPLE_ESCROW.order_id,
				script_address: SAMPLE_ESCROW.script_address,
				utxo_tx_hash: SAMPLE_ESCROW.utxo_tx_hash,
				utxo_output_index: SAMPLE_ESCROW.utxo_output_index,
				status: SAMPLE_ESCROW.status,
				buyer_pkh: SAMPLE_ESCROW.buyer_pkh,
				merchant_pkh: SAMPLE_ESCROW.merchant_pkh,
				paid_at: SAMPLE_ESCROW.paid_at,
				ship_deadline: SAMPLE_ESCROW.ship_deadline,
				datum_cbor: SAMPLE_ESCROW.datum_cbor,
			}),
		).rejects.toThrow('relation "escrows" does not exist');
	});
});

// ---------------------------------------------------------------------------
// getEscrowByOrderId
// ---------------------------------------------------------------------------
describe('getEscrowByOrderId', () => {
	it('returns the escrow row when present', async () => {
		// getEscrowByOrderId calls: from('escrows').select('*').eq('order_id', ...).single()
		const mockSingleChained = vi.fn().mockResolvedValueOnce({ data: SAMPLE_ESCROW, error: null });
		const mockEqChained = vi.fn(() => ({ single: mockSingleChained }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: vi.fn(),
			select: mockSelectChained,
		});

		const result = await getEscrowByOrderId(SAMPLE_ESCROW.order_id);

		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockEqChained).toHaveBeenCalledWith('order_id', SAMPLE_ESCROW.order_id);
		expect(result).toEqual(SAMPLE_ESCROW);
	});

	it('returns null when no escrow exists for the order', async () => {
		// PGRST116 = "no rows returned" from PostgREST single()
		const mockSingleChained = vi.fn().mockResolvedValueOnce({
			data: null,
			error: { code: 'PGRST116', message: 'no rows returned' },
		});
		const mockEqChained = vi.fn(() => ({ single: mockSingleChained }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: vi.fn(),
			select: mockSelectChained,
		});

		const result = await getEscrowByOrderId('no-escrow-order-id');
		expect(result).toBeNull();
	});

	it('throws for unexpected Supabase errors', async () => {
		const mockSingleChained = vi.fn().mockResolvedValueOnce({
			data: null,
			error: { code: '42P01', message: 'table not found' },
		});
		const mockEqChained = vi.fn(() => ({ single: mockSingleChained }));
		const mockSelectChained = vi.fn(() => ({ eq: mockEqChained }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: vi.fn(),
			select: mockSelectChained,
		});

		await expect(getEscrowByOrderId(SAMPLE_ESCROW.order_id)).rejects.toThrow('table not found');
	});
});

// ---------------------------------------------------------------------------
// updateEscrowState
// ---------------------------------------------------------------------------
describe('updateEscrowState', () => {
	it('applies the shipped transition: sets status, shipped_tx_hash, grace_period_end, utxo_tx_hash, utxo_output_index, datum_cbor', async () => {
		const mockEqUpdate = vi.fn().mockResolvedValueOnce({ error: null });
		const mockUpdateChained = vi.fn(() => ({ eq: mockEqUpdate }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: mockUpdateChained,
			select: vi.fn(),
		});

		await updateEscrowState(SAMPLE_ESCROW.order_id, {
			type: 'shipped',
			shipped_tx_hash: 'shippedtxhash',
			utxo_tx_hash: 'newutxotxhash',
			utxo_output_index: 1,
			datum_cbor: 'newdatumcbor',
			grace_period_end: '2026-06-04T00:00:00Z',
		});

		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockUpdateChained).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'shipped',
				shipped_tx_hash: 'shippedtxhash',
				utxo_tx_hash: 'newutxotxhash',
				utxo_output_index: 1,
				datum_cbor: 'newdatumcbor',
				grace_period_end: '2026-06-04T00:00:00Z',
			}),
		);
		expect(mockEqUpdate).toHaveBeenCalledWith('order_id', SAMPLE_ESCROW.order_id);
	});

	it('applies the released transition: sets status and release_tx_hash', async () => {
		const mockEqUpdate = vi.fn().mockResolvedValueOnce({ error: null });
		const mockUpdateChained = vi.fn(() => ({ eq: mockEqUpdate }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: mockUpdateChained,
			select: vi.fn(),
		});

		await updateEscrowState(SAMPLE_ESCROW.order_id, {
			type: 'released',
			release_tx_hash: 'releasedtxhash',
		});

		expect(mockUpdateChained).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'released',
				release_tx_hash: 'releasedtxhash',
			}),
		);
		expect(mockEqUpdate).toHaveBeenCalledWith('order_id', SAMPLE_ESCROW.order_id);
	});

	it('applies the refunded transition: sets status and refund_tx_hash', async () => {
		const mockEqUpdate = vi.fn().mockResolvedValueOnce({ error: null });
		const mockUpdateChained = vi.fn(() => ({ eq: mockEqUpdate }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: mockUpdateChained,
			select: vi.fn(),
		});

		await updateEscrowState(SAMPLE_ESCROW.order_id, {
			type: 'refunded',
			refund_tx_hash: 'refundedtxhash',
		});

		expect(mockUpdateChained).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'refunded',
				refund_tx_hash: 'refundedtxhash',
			}),
		);
		expect(mockEqUpdate).toHaveBeenCalledWith('order_id', SAMPLE_ESCROW.order_id);
	});

	it('throws when Supabase returns an error', async () => {
		const mockEqUpdate = vi.fn().mockResolvedValueOnce({ error: { message: 'update failed' } });
		const mockUpdateChained = vi.fn(() => ({ eq: mockEqUpdate }));

		mockFrom.mockReturnValueOnce({
			insert: mockInsert,
			update: mockUpdateChained,
			select: vi.fn(),
		});

		await expect(
			updateEscrowState(SAMPLE_ESCROW.order_id, {
				type: 'released',
				release_tx_hash: 'releasedtxhash',
			}),
		).rejects.toThrow('update failed');
	});
});
