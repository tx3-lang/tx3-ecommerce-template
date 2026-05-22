/**
 * Tests for scripts/escrow-refund.ts
 *
 * Tests the `main(args)` function extracted from the CLI entry point.
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js           — Supabase client (escrows SELECT, escrows UPDATE, orders UPDATE)
 *   - @/lib/cardano/escrow            — submitRefundEscrow
 *   - @/server-fns/order-events       — insertOrderEvent
 *   - @/lib/cardano/network           — getNetworkConfig (controls explorer URL)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared Supabase mock fns
//
// The script does:
//   supabase.from('escrows').select('*').eq('order_id', orderId).single()
//   supabase.from('escrows').update({...}).eq('order_id', orderId)
//   supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();
// SELECT chain: .select('*').eq(...).single()
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
// Mock: submitRefundEscrow
// ---------------------------------------------------------------------------
const mockSubmitRefundEscrow = vi.fn();

vi.mock('@/lib/cardano/escrow', () => ({
	submitRefundEscrow: mockSubmitRefundEscrow,
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
const { main } = await import('../escrow-refund.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TX_HASH = 'cafebabe00112233deadbeef445566778899aabbccddeeff00112233445566778899';
// Valid 32-byte Ed25519 private key (test only — never use in production)
const BUYER_KEY_HEX = 'a'.repeat(64);

const REFUND_RESULT = { txHash: TX_HASH };

const SAMPLE_ORDER_EVENT: Database.OrderEvent = {
	id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
	order_id: ORDER_ID,
	event_type: 'cancelled',
	tx_hash: TX_HASH,
	payload: { v: 1, event: 'cancelled' },
	submitted_at: '2026-05-22T00:00:00Z',
	confirmed_at: null,
};

// Ship deadline in the past (deadline exceeded → can refund)
const PAST_SHIP_DEADLINE = new Date(Date.now() - 86400 * 1000).toISOString(); // -1 day
// Ship deadline in the future (not yet exceeded → cannot refund)
const FUTURE_SHIP_DEADLINE = new Date(Date.now() + 86400 * 1000).toISOString(); // +1 day

const STUB_ESCROW_PENDING: Database.Escrow = {
	id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
	order_id: ORDER_ID,
	script_address: 'addr_test1_script',
	utxo_tx_hash: 'aabbccdd00112233',
	utxo_output_index: 0,
	status: 'pending',
	buyer_pkh: '00'.repeat(28),
	merchant_pkh: 'ff'.repeat(28),
	paid_at: new Date(Date.now() - 3600 * 1000).toISOString(),
	ship_deadline: PAST_SHIP_DEADLINE,
	grace_period_end: null,
	datum_cbor: 'd87980',
	shipped_tx_hash: null,
	release_tx_hash: null,
	refund_tx_hash: null,
	created_at: '2026-05-22T00:00:00Z',
	updated_at: '2026-05-22T00:00:00Z',
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
	mockSubmitRefundEscrow.mockResolvedValue(REFUND_RESULT);
	mockInsertOrderEvent.mockResolvedValue(SAMPLE_ORDER_EVENT);
	mockEqUpdate.mockResolvedValue({ error: null });

	// Default: escrow is pending with exceeded ship deadline
	mockSingle.mockResolvedValue({ data: STUB_ESCROW_PENDING, error: null });
});

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
describe('arg parsing', () => {
	it('rejects missing --order-id with MISSING_ARG error', async () => {
		await expect(main(['--buyer-key', BUYER_KEY_HEX])).rejects.toThrow('MISSING_ARG');
	});

	it('rejects missing --buyer-key with MISSING_ARG error', async () => {
		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('MISSING_ARG');
	});

	it('rejects invalid --buyer-key (wrong length) with INVALID_ARG error', async () => {
		mockSingle.mockResolvedValue({ data: STUB_ESCROW_PENDING, error: null });

		await expect(main(['--order-id', ORDER_ID, '--buyer-key', 'deadbeef'])).rejects.toThrow('INVALID_ARG');
	});

	it('accepts --order-id and --buyer-key together', async () => {
		await expect(main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX])).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Escrow state validation
// ---------------------------------------------------------------------------
describe('escrow state validation', () => {
	it('queries the escrows table for the given order_id', async () => {
		await main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX]);

		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockSelect).toHaveBeenCalledWith('*');
		expect(mockEqSelect).toHaveBeenCalledWith('order_id', ORDER_ID);
		expect(mockSingle).toHaveBeenCalled();
	});

	it('aborts with INVALID_STATE when escrow status is "shipped"', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_PENDING, status: 'shipped' },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX])).rejects.toThrow('INVALID_STATE');
	});

	it('aborts with INVALID_STATE when escrow status is "released"', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_PENDING, status: 'released' },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX])).rejects.toThrow('INVALID_STATE');
	});

	it('aborts with SHIP_DEADLINE_NOT_REACHED when NOW() < ship_deadline', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { ...STUB_ESCROW_PENDING, ship_deadline: FUTURE_SHIP_DEADLINE },
			error: null,
		});

		await expect(main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX])).rejects.toThrow('SHIP_DEADLINE_NOT_REACHED');
	});

	it('aborts with ESCROW_NOT_FOUND when Supabase returns no data', async () => {
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { message: 'not found', code: 'PGRST116' },
		});

		await expect(main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX])).rejects.toThrow('ESCROW_NOT_FOUND');
	});

	it('proceeds when status="pending" and ship_deadline has passed', async () => {
		await expect(main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX])).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// submitRefundEscrow call
// ---------------------------------------------------------------------------
describe('submitRefundEscrow', () => {
	it('calls submitRefundEscrow with the orderId and a buyer signer', async () => {
		await main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX]);

		expect(mockSubmitRefundEscrow).toHaveBeenCalledOnce();
		expect(mockSubmitRefundEscrow).toHaveBeenCalledWith(
			ORDER_ID,
			// buyer signer is a CardanoWalletAPI object — check it has a signTx method
			expect.objectContaining({ signTx: expect.any(Function) }),
		);
	});
});

// ---------------------------------------------------------------------------
// DB updates on success
// ---------------------------------------------------------------------------
describe('DB updates on success', () => {
	it('updates escrows with status="refunded" and refund_tx_hash', async () => {
		await main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX]);

		expect(mockFrom).toHaveBeenCalledWith('escrows');
		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'refunded',
				refund_tx_hash: TX_HASH,
			}),
		);
		expect(mockEqUpdate).toHaveBeenCalledWith('order_id', ORDER_ID);
	});

	it('updates orders with status="cancelled"', async () => {
		await main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX]);

		expect(mockFrom).toHaveBeenCalledWith('orders');
		expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
		expect(mockEqUpdate).toHaveBeenCalledWith('id', ORDER_ID);
	});

	it('inserts an order_events row with event_type="cancelled", tx hash, and reason="ship_deadline_exceeded"', async () => {
		await main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX]);

		expect(mockInsertOrderEvent).toHaveBeenCalledOnce();
		expect(mockInsertOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ORDER_ID,
				event_type: 'cancelled',
				tx_hash: TX_HASH,
				payload: expect.objectContaining({
					reason: 'ship_deadline_exceeded',
				}),
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// submitRefundEscrow failure — DB stays clean (no writes on chain failure)
// ---------------------------------------------------------------------------
describe('submitRefundEscrow failure', () => {
	it('does NOT update escrows when submitRefundEscrow throws', async () => {
		mockSubmitRefundEscrow.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX])).rejects.toThrow();

		// Only escrows SELECT should have been called, not UPDATE
		const updateCalls = mockUpdate.mock.calls;
		expect(updateCalls).toHaveLength(0);
	});

	it('does NOT update orders when submitRefundEscrow throws', async () => {
		mockSubmitRefundEscrow.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX])).rejects.toThrow();

		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it('does NOT call insertOrderEvent when submitRefundEscrow throws', async () => {
		mockSubmitRefundEscrow.mockRejectedValueOnce(new Error('ChainUnavailable: connection refused'));

		await expect(main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX])).rejects.toThrow();

		expect(mockInsertOrderEvent).not.toHaveBeenCalled();
	});

	it('propagates the chain error', async () => {
		mockSubmitRefundEscrow.mockRejectedValueOnce(new Error('TxRejected'));

		await expect(main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX])).rejects.toThrow('TxRejected');
	});
});

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
describe('output', () => {
	it('includes the tx hash in the return value', async () => {
		const result = await main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX]);

		expect(result.txHash).toBe(TX_HASH);
	});

	it('includes a preview.cexplorer.io explorer URL when profile is "preview"', async () => {
		mockGetNetworkConfig.mockReturnValue(STUB_NETWORK_PREVIEW);

		const result = await main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX]);

		expect(result.explorerUrl).toBe(`https://preview.cexplorer.io/tx/${TX_HASH}`);
	});

	it('does NOT include an explorer URL when profile is "local"', async () => {
		mockGetNetworkConfig.mockReturnValue(STUB_NETWORK_LOCAL);

		const result = await main(['--order-id', ORDER_ID, '--buyer-key', BUYER_KEY_HEX]);

		expect(result.explorerUrl).toBeUndefined();
	});
});
