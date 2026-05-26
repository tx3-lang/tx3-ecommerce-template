/**
 * Tests for src/lib/cardano/traceability.ts
 *
 * Mocks at all external boundaries:
 *   - @/lib/tx3/protocol        — codegen Client (recordOrderEvent + submit)
 *   - ./signer.js               — getMerchantSigner
 *   - ./network.js              — getNetworkConfig
 *   - @/server-fns/escrows      — getEscrowByOrderId
 *
 * Asserts the new 4-label metadata wire shape: each event becomes one tx with
 * four named args (`event`, `order_id`, `ts`, `extra`), each hex-encoded UTF-8
 * (or Int for ts). See traceability.ts for the metadata layout rationale.
 */

import { Buffer } from 'buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock fns — declared before vi.mock() so factories can close over them
// ---------------------------------------------------------------------------

const mockRecordOrderEvent = vi.fn();
const mockSubmit = vi.fn();
const mockClientConstructor = vi.fn();

// ---------------------------------------------------------------------------
// Mock: codegen Client
// ---------------------------------------------------------------------------

vi.mock('@/lib/tx3/protocol', () => {
	// Named function so `new Client(opts, profile, parties)` works as a constructor call.
	function Client(options: unknown, profile: unknown, parties: unknown) {
		mockClientConstructor(options, profile, parties);
		return {
			recordOrderEvent: mockRecordOrderEvent,
			submit: mockSubmit,
		};
	}

	return { Client };
});

// ---------------------------------------------------------------------------
// Mock: signer
// ---------------------------------------------------------------------------

const STUB_WITNESSES = [
	{
		type: 'vkey',
		key: { content: 'aabbcc', contentType: 'hex' as const },
		signature: { content: 'ddeeff', contentType: 'hex' as const },
	},
];

const mockSign = vi.fn().mockReturnValue(STUB_WITNESSES);
const mockGetMerchantSigner = vi.fn().mockReturnValue({ sign: mockSign });

vi.mock('../signer.js', () => ({
	getMerchantSigner: mockGetMerchantSigner,
}));

// ---------------------------------------------------------------------------
// Mock: network config
// ---------------------------------------------------------------------------

const STUB_CONFIG = {
	trpEndpoint: 'http://localhost:50051',
	profile: 'local' as const,
	metadataLabel: 1337,
	merchantAddress: 'addr1qtest_merchant',
};

const mockGetNetworkConfig = vi.fn().mockReturnValue(STUB_CONFIG);

vi.mock('../network.js', () => ({
	getNetworkConfig: mockGetNetworkConfig,
}));

// ---------------------------------------------------------------------------
// Mock: escrows server-fn
// ---------------------------------------------------------------------------

const mockGetEscrowByOrderId = vi.fn();

vi.mock('@/server-fns/escrows', () => ({
	getEscrowByOrderId: mockGetEscrowByOrderId,
}));

// ---------------------------------------------------------------------------
// Stub return values for protocol calls
// ---------------------------------------------------------------------------

const STUB_ENVELOPE = { tx: 'deadbeef01020304', hash: 'cafebabe00112233' };
const STUB_SUBMIT_RESPONSE = { status: 'accepted' };

// ---------------------------------------------------------------------------
// Import module under test (after mocks are registered)
// ---------------------------------------------------------------------------

const { submitPaidTrace, submitShippedTrace, submitCompletedTrace, submitCancelledTrace } = await import(
	'../traceability.js'
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();
	mockGetNetworkConfig.mockReturnValue(STUB_CONFIG);
	mockSign.mockReturnValue(STUB_WITNESSES);
	mockGetMerchantSigner.mockReturnValue({ sign: mockSign });
	mockRecordOrderEvent.mockResolvedValue(STUB_ENVELOPE);
	mockSubmit.mockResolvedValue(STUB_SUBMIT_RESPONSE);
	mockGetEscrowByOrderId.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Helpers — decode the args passed to client.recordOrderEvent
// ---------------------------------------------------------------------------

interface RecordOrderEventArgs {
	event: string;
	order_id: string;
	ts: number;
	extra: string;
}

function getArgs(callIndex = 0): RecordOrderEventArgs {
	return mockRecordOrderEvent.mock.calls[callIndex][0] as RecordOrderEventArgs;
}

function hexToUtf8(hex: string): string {
	return Buffer.from(hex, 'hex').toString('utf8');
}

// ---------------------------------------------------------------------------
// submitPaidTrace
// ---------------------------------------------------------------------------

describe('submitPaidTrace', () => {
	describe('metadata args', () => {
		it('sends event="paid" hex-encoded under the `event` arg', async () => {
			await submitPaidTrace('order-uuid-1234');

			expect(mockRecordOrderEvent).toHaveBeenCalledOnce();
			const args = getArgs();
			expect(hexToUtf8(args.event)).toBe('paid');
		});

		it('sends the order_id hex-encoded under the `order_id` arg', async () => {
			const orderId = 'my-order-uuid-5678';
			await submitPaidTrace(orderId);

			expect(hexToUtf8(getArgs().order_id)).toBe(orderId);
		});

		it('sends a numeric ts (Unix seconds) under the `ts` arg', async () => {
			const before = Math.floor(Date.now() / 1000);
			await submitPaidTrace('order-ts-check');
			const after = Math.floor(Date.now() / 1000);

			const { ts } = getArgs();
			expect(typeof ts).toBe('number');
			expect(ts).toBeGreaterThanOrEqual(before);
			expect(ts).toBeLessThanOrEqual(after);
		});

		it('sends an empty `extra` for paid (no event-specific payload)', async () => {
			await submitPaidTrace('order-extra-check');

			expect(getArgs().extra).toBe('');
		});

		it('each Bytes arg is a hex string', async () => {
			await submitPaidTrace('order-args-hex');
			const { event, order_id, extra } = getArgs();

			expect(event).toMatch(/^[0-9a-f]*$/);
			expect(order_id).toMatch(/^[0-9a-f]*$/);
			expect(extra).toMatch(/^[0-9a-f]*$/);
		});
	});

	describe('client construction', () => {
		it('injects the merchant party at Client construction', async () => {
			await submitPaidTrace('order-party-inject');

			const parties = mockClientConstructor.mock.calls[0][2] as Record<string, string>;
			expect(parties).toMatchObject({ merchant: STUB_CONFIG.merchantAddress });
		});

		it('constructs Client with the endpoint, profile, and merchant party', async () => {
			await submitPaidTrace('order-client-opts');

			expect(mockClientConstructor).toHaveBeenCalledOnce();
			expect(mockClientConstructor).toHaveBeenCalledWith({ endpoint: STUB_CONFIG.trpEndpoint }, STUB_CONFIG.profile, {
				merchant: STUB_CONFIG.merchantAddress,
			});
		});
	});

	describe('signing', () => {
		it('calls getMerchantSigner().sign with the envelope hash', async () => {
			await submitPaidTrace('order-sign-check');

			expect(mockGetMerchantSigner).toHaveBeenCalled();
			expect(mockSign).toHaveBeenCalledOnce();
			expect(mockSign).toHaveBeenCalledWith(STUB_ENVELOPE.hash);
		});
	});

	describe('submit', () => {
		it('calls client.submit with the envelope tx content and witnesses', async () => {
			await submitPaidTrace('order-submit-check');

			expect(mockSubmit).toHaveBeenCalledOnce();
			expect(mockSubmit).toHaveBeenCalledWith({
				tx: { content: STUB_ENVELOPE.tx, contentType: 'hex' },
				witnesses: STUB_WITNESSES,
			});
		});
	});

	describe('return value', () => {
		it('returns { txHash, confirmed: false } with the envelope hash', async () => {
			const result = await submitPaidTrace('order-return-check');

			expect(result).toEqual({
				txHash: STUB_ENVELOPE.hash,
				confirmed: false,
			});
		});
	});

	describe('error propagation', () => {
		it('propagates errors from client.submit unchanged', async () => {
			const chainError = new Error('ChainUnavailable: connection refused');
			mockSubmit.mockRejectedValueOnce(chainError);

			await expect(submitPaidTrace('order-error-check')).rejects.toThrow('ChainUnavailable: connection refused');
		});

		it('propagates errors from client.recordOrderEvent unchanged', async () => {
			const resolveError = new Error('resolve failed');
			mockRecordOrderEvent.mockRejectedValueOnce(resolveError);

			await expect(submitPaidTrace('order-resolve-error')).rejects.toThrow('resolve failed');
		});
	});

	describe('escrow short-circuit', () => {
		const STUB_ESCROW_TX_HASH = 'escrow_lock_tx_hash_aabbcc';

		it('returns { txHash: escrow.utxo_tx_hash, confirmed: true } without submitting when escrow row exists', async () => {
			const stubEscrow: Partial<Database.Escrow> = {
				order_id: 'order-escrow-1',
				utxo_tx_hash: STUB_ESCROW_TX_HASH,
				status: 'pending',
			};
			mockGetEscrowByOrderId.mockResolvedValueOnce(stubEscrow);

			const result = await submitPaidTrace('order-escrow-1');

			expect(result).toEqual({ txHash: STUB_ESCROW_TX_HASH, confirmed: true });
			expect(mockRecordOrderEvent).not.toHaveBeenCalled();
			expect(mockSubmit).not.toHaveBeenCalled();
		});

		it('falls back to the metadata-only chain path when no escrow row exists', async () => {
			const result = await submitPaidTrace('order-no-escrow');

			expect(result).toEqual({ txHash: STUB_ENVELOPE.hash, confirmed: false });
			expect(mockRecordOrderEvent).toHaveBeenCalledOnce();
			expect(mockSubmit).toHaveBeenCalledOnce();
		});
	});
});

// ---------------------------------------------------------------------------
// submitShippedTrace
// ---------------------------------------------------------------------------

describe('submitShippedTrace', () => {
	describe('metadata args — no tracking number', () => {
		it('sends event="shipped"', async () => {
			await submitShippedTrace('order-shipped-1');

			expect(mockRecordOrderEvent).toHaveBeenCalledOnce();
			expect(hexToUtf8(getArgs().event)).toBe('shipped');
		});

		it('sends the order_id', async () => {
			await submitShippedTrace('order-shipped-2');

			expect(hexToUtf8(getArgs().order_id)).toBe('order-shipped-2');
		});

		it('sends an empty extra when no trackingNumber is provided', async () => {
			await submitShippedTrace('order-shipped-3');

			expect(getArgs().extra).toBe('');
		});

		it('sends an empty extra when opts is provided but trackingNumber is omitted', async () => {
			await submitShippedTrace('order-shipped-4', {});

			expect(getArgs().extra).toBe('');
		});
	});

	describe('metadata args — with tracking number', () => {
		it('hex-encodes the tracking number into the extra arg', async () => {
			await submitShippedTrace('order-shipped-5', { trackingNumber: 'ABC123' });

			expect(hexToUtf8(getArgs().extra)).toBe('ABC123');
		});
	});

	describe('pipeline', () => {
		it('calls recordOrderEvent, signer.sign, and client.submit each once', async () => {
			await submitShippedTrace('order-shipped-pipeline');

			expect(mockRecordOrderEvent).toHaveBeenCalledOnce();
			expect(mockSign).toHaveBeenCalledOnce();
			expect(mockSubmit).toHaveBeenCalledOnce();
		});

		it('returns { txHash, confirmed: false }', async () => {
			const result = await submitShippedTrace('order-shipped-return');

			expect(result).toEqual({ txHash: STUB_ENVELOPE.hash, confirmed: false });
		});
	});
});

// ---------------------------------------------------------------------------
// submitCompletedTrace
// ---------------------------------------------------------------------------

describe('submitCompletedTrace', () => {
	describe('metadata args', () => {
		it('sends event="completed"', async () => {
			await submitCompletedTrace('order-completed-1');

			expect(mockRecordOrderEvent).toHaveBeenCalledOnce();
			expect(hexToUtf8(getArgs().event)).toBe('completed');
		});

		it('sends the order_id', async () => {
			await submitCompletedTrace('order-completed-2');

			expect(hexToUtf8(getArgs().order_id)).toBe('order-completed-2');
		});

		it('sends an empty extra', async () => {
			await submitCompletedTrace('order-completed-3');

			expect(getArgs().extra).toBe('');
		});
	});

	describe('pipeline', () => {
		it('calls recordOrderEvent, signer.sign, and client.submit each once', async () => {
			await submitCompletedTrace('order-completed-pipeline');

			expect(mockRecordOrderEvent).toHaveBeenCalledOnce();
			expect(mockSign).toHaveBeenCalledOnce();
			expect(mockSubmit).toHaveBeenCalledOnce();
		});

		it('returns { txHash, confirmed: false }', async () => {
			const result = await submitCompletedTrace('order-completed-return');

			expect(result).toEqual({ txHash: STUB_ENVELOPE.hash, confirmed: false });
		});
	});
});

// ---------------------------------------------------------------------------
// submitCancelledTrace
// ---------------------------------------------------------------------------

describe('submitCancelledTrace', () => {
	describe('metadata args', () => {
		it('sends event="cancelled"', async () => {
			await submitCancelledTrace('order-cancelled-1', { reason: 'buyer requested' });

			expect(mockRecordOrderEvent).toHaveBeenCalledOnce();
			expect(hexToUtf8(getArgs().event)).toBe('cancelled');
		});

		it('sends the order_id', async () => {
			await submitCancelledTrace('order-cancelled-2', { reason: 'out of stock' });

			expect(hexToUtf8(getArgs().order_id)).toBe('order-cancelled-2');
		});

		it('hex-encodes the reason into the extra arg', async () => {
			await submitCancelledTrace('order-cancelled-3', { reason: 'buyer requested' });

			expect(hexToUtf8(getArgs().extra)).toBe('buyer requested');
		});

		it('carries the provided reason through', async () => {
			await submitCancelledTrace('order-cancelled-4', { reason: 'fraud detected' });

			expect(hexToUtf8(getArgs().extra)).toBe('fraud detected');
		});
	});

	describe('pipeline', () => {
		it('calls recordOrderEvent, signer.sign, and client.submit each once', async () => {
			await submitCancelledTrace('order-cancelled-pipeline', { reason: 'test' });

			expect(mockRecordOrderEvent).toHaveBeenCalledOnce();
			expect(mockSign).toHaveBeenCalledOnce();
			expect(mockSubmit).toHaveBeenCalledOnce();
		});

		it('returns { txHash, confirmed: false }', async () => {
			const result = await submitCancelledTrace('order-cancelled-return', { reason: 'test' });

			expect(result).toEqual({ txHash: STUB_ENVELOPE.hash, confirmed: false });
		});
	});
});
