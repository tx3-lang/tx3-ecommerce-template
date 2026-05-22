/**
 * Tests for the new submitPaymentServerFn shape in src/server-fns/payments.ts.
 *
 * After Task 12, submitPaymentServerFn accepts:
 *   {orderId, lockTxHash, lockOutputIndex, datumCbor, scriptAddress, buyerPkh, merchantPkh, paidAt, shipDeadline}
 *
 * And performs 3 DB operations in sequence:
 *   1. insertEscrow({ ..., status: 'pending' })
 *   2. UPDATE orders SET status='paid', cardano_tx_hash=lockTxHash  (via Supabase)
 *   3. insertOrderEvent({ event_type: 'paid', tx_hash: lockTxHash, confirmed_at: NOW() })
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js     — Supabase client (for direct order update)
 *   - @/server-fns/escrows      — insertEscrow
 *   - @/server-fns/order-events — insertOrderEvent
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: Supabase (for updateOrderStatusPaid)
// ---------------------------------------------------------------------------
const mockEqUpdate = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEqUpdate }));
const mockFrom = vi.fn(() => ({
	update: mockUpdate,
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		from: mockFrom,
	})),
}));

// ---------------------------------------------------------------------------
// Mock: insertEscrow
// ---------------------------------------------------------------------------
const mockInsertEscrow = vi.fn();

vi.mock('@/server-fns/escrows', () => ({
	insertEscrow: mockInsertEscrow,
	getEscrowByOrderId: vi.fn(),
	updateEscrowState: vi.fn(),
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
// Import the module under test AFTER mocks are registered
// ---------------------------------------------------------------------------
const { handleLockPayment } = await import('../payments.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LOCK_TX_HASH = 'deadbeef1234567890deadbeef1234567890deadbeef1234567890deadbeef12';
const DATUM_CBOR = 'd87980';
const SCRIPT_ADDRESS = 'addr_test1qztest';
const BUYER_PKH = 'buyerpkh0000000000000000000000000000000000000000000000000000';
const MERCHANT_PKH = 'merchantpkh00000000000000000000000000000000000000000000000000';
const PAID_AT = '2026-05-22T00:00:00.000Z';
const SHIP_DEADLINE = '2026-05-29T00:00:00.000Z';

const SAMPLE_INPUT = {
	orderId: ORDER_ID,
	lockTxHash: LOCK_TX_HASH,
	lockOutputIndex: 0,
	datumCbor: DATUM_CBOR,
	scriptAddress: SCRIPT_ADDRESS,
	buyerPkh: BUYER_PKH,
	merchantPkh: MERCHANT_PKH,
	paidAt: PAID_AT,
	shipDeadline: SHIP_DEADLINE,
};

const SAMPLE_ESCROW: Database.Escrow = {
	id: 'esc00000-0000-0000-0000-000000000000',
	order_id: ORDER_ID,
	script_address: SCRIPT_ADDRESS,
	utxo_tx_hash: LOCK_TX_HASH,
	utxo_output_index: 0,
	status: 'pending',
	buyer_pkh: BUYER_PKH,
	merchant_pkh: MERCHANT_PKH,
	paid_at: PAID_AT,
	ship_deadline: SHIP_DEADLINE,
	grace_period_end: null,
	datum_cbor: DATUM_CBOR,
	shipped_tx_hash: null,
	release_tx_hash: null,
	refund_tx_hash: null,
	created_at: '2026-05-22T00:00:00Z',
	updated_at: '2026-05-22T00:00:00Z',
};

beforeEach(() => {
	vi.clearAllMocks();

	// Happy-path defaults
	mockInsertEscrow.mockResolvedValue(SAMPLE_ESCROW);
	mockEqUpdate.mockResolvedValue({ error: null });
	mockUpdate.mockReturnValue({ eq: mockEqUpdate });
	mockFrom.mockReturnValue({ update: mockUpdate });
	mockInsertOrderEvent.mockResolvedValue({
		id: 'evt-1',
		order_id: ORDER_ID,
		event_type: 'paid',
		tx_hash: LOCK_TX_HASH,
		payload: { v: 1, event: 'paid' },
		submitted_at: PAID_AT,
		confirmed_at: PAID_AT,
	});
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
describe('handleLockPayment — happy path', () => {
	it('calls insertEscrow with the correct fields including status=pending', async () => {
		await handleLockPayment(SAMPLE_INPUT);

		expect(mockInsertEscrow).toHaveBeenCalledOnce();
		expect(mockInsertEscrow).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ORDER_ID,
				script_address: SCRIPT_ADDRESS,
				utxo_tx_hash: LOCK_TX_HASH,
				utxo_output_index: 0,
				status: 'pending',
				buyer_pkh: BUYER_PKH,
				merchant_pkh: MERCHANT_PKH,
				datum_cbor: DATUM_CBOR,
				paid_at: PAID_AT,
				ship_deadline: SHIP_DEADLINE,
			}),
		);
	});

	it('updates orders table with status=paid and cardano_tx_hash=lockTxHash', async () => {
		await handleLockPayment(SAMPLE_INPUT);

		expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', cardano_tx_hash: LOCK_TX_HASH }));
		expect(mockEqUpdate).toHaveBeenCalledWith('id', ORDER_ID);
	});

	it('calls insertOrderEvent with event_type=paid, tx_hash=lockTxHash, and a payload', async () => {
		await handleLockPayment(SAMPLE_INPUT);

		expect(mockInsertOrderEvent).toHaveBeenCalledOnce();
		expect(mockInsertOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				order_id: ORDER_ID,
				event_type: 'paid',
				tx_hash: LOCK_TX_HASH,
				payload: expect.objectContaining({ event: 'paid' }),
			}),
		);
	});

	it('returns success: true with the lockTxHash', async () => {
		const result = await handleLockPayment(SAMPLE_INPUT);

		expect(result).toEqual(
			expect.objectContaining({
				success: true,
				lockTxHash: LOCK_TX_HASH,
			}),
		);
	});

	it('calls operations in the correct order: insertEscrow → updateOrder → insertOrderEvent', async () => {
		const callOrder: string[] = [];
		mockInsertEscrow.mockImplementation(async () => {
			callOrder.push('insertEscrow');
			return SAMPLE_ESCROW;
		});
		mockUpdate.mockImplementation(() => {
			callOrder.push('updateOrder');
			return { eq: mockEqUpdate };
		});
		mockInsertOrderEvent.mockImplementation(async () => {
			callOrder.push('insertOrderEvent');
			return {};
		});

		await handleLockPayment(SAMPLE_INPUT);

		expect(callOrder).toEqual(['insertEscrow', 'updateOrder', 'insertOrderEvent']);
	});
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------
describe('handleLockPayment — insertEscrow failure', () => {
	it('throws when insertEscrow throws and does not call updateOrder or insertOrderEvent', async () => {
		mockInsertEscrow.mockRejectedValueOnce(new Error('DB: insert failed'));

		await expect(handleLockPayment(SAMPLE_INPUT)).rejects.toThrow('DB: insert failed');

		expect(mockUpdate).not.toHaveBeenCalled();
		expect(mockInsertOrderEvent).not.toHaveBeenCalled();
	});
});

describe('handleLockPayment — updateOrder failure', () => {
	it('throws when Supabase update returns an error and does not call insertOrderEvent', async () => {
		mockEqUpdate.mockResolvedValueOnce({ error: { message: 'Order update failed' } });

		await expect(handleLockPayment(SAMPLE_INPUT)).rejects.toThrow('Failed to update order: Order update failed');

		// insertEscrow was already called
		expect(mockInsertEscrow).toHaveBeenCalledOnce();
		// insertOrderEvent should not be called
		expect(mockInsertOrderEvent).not.toHaveBeenCalled();
	});
});

describe('handleLockPayment — insertOrderEvent failure', () => {
	it('throws when insertOrderEvent throws', async () => {
		mockInsertOrderEvent.mockRejectedValueOnce(new Error('Event insert failed'));

		await expect(handleLockPayment(SAMPLE_INPUT)).rejects.toThrow('Event insert failed');

		// Both insertEscrow and updateOrder were called
		expect(mockInsertEscrow).toHaveBeenCalledOnce();
		expect(mockUpdate).toHaveBeenCalledOnce();
	});
});
