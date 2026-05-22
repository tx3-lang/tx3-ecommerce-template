/**
 * Tests for src/lib/cardano/traceability.ts
 *
 * Mocks at all three external boundaries:
 *   - @/lib/tx3/protocol  — codegen Client (recordOrderEvent + submit)
 *   - ./signer.js          — getMerchantSigner
 *   - ./network.js         — getNetworkConfig
 */

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
	// Named function so `new Client(opts, profile)` works as a constructor call.
	function Client(options: unknown, profile: unknown) {
		mockClientConstructor(options, profile);
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
// Stub return values for protocol calls
// ---------------------------------------------------------------------------

const STUB_ENVELOPE = { tx: 'deadbeef01020304', hash: 'cafebabe00112233' };
const STUB_SUBMIT_RESPONSE = { status: 'accepted' };

// ---------------------------------------------------------------------------
// Import module under test (after mocks are registered)
// vi.mock calls are hoisted to top of file, so by the time this runs the
// factories are already registered and the imports below will receive mocks.
// ---------------------------------------------------------------------------

const { submitPaidTrace } = await import('../traceability.js');

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
});

describe('submitPaidTrace', () => {
	describe('payload shape', () => {
		it('builds a payload with v=1 and event="paid"', async () => {
			await submitPaidTrace('order-uuid-1234');

			expect(mockRecordOrderEvent).toHaveBeenCalledOnce();
			const callArgs = mockRecordOrderEvent.mock.calls[0][0] as { metadataPayload: string; merchant: string };
			const raw = Buffer.from(callArgs.metadataPayload, 'hex').toString('utf8');
			const payload = JSON.parse(raw);

			expect(payload.v).toBe(1);
			expect(payload.event).toBe('paid');
		});

		it('includes the order_id in the payload', async () => {
			const orderId = 'my-order-uuid-5678';
			await submitPaidTrace(orderId);

			const callArgs = mockRecordOrderEvent.mock.calls[0][0] as { metadataPayload: string };
			const payload = JSON.parse(Buffer.from(callArgs.metadataPayload, 'hex').toString('utf8'));

			expect(payload.order_id).toBe(orderId);
		});

		it('includes merchant from config in the payload', async () => {
			await submitPaidTrace('order-abc');

			const callArgs = mockRecordOrderEvent.mock.calls[0][0] as { metadataPayload: string };
			const payload = JSON.parse(Buffer.from(callArgs.metadataPayload, 'hex').toString('utf8'));

			expect(payload.merchant).toBe(STUB_CONFIG.merchantAddress);
		});

		it('includes a numeric ts (Unix seconds) in the payload', async () => {
			const before = Math.floor(Date.now() / 1000);
			await submitPaidTrace('order-ts-check');
			const after = Math.floor(Date.now() / 1000);

			const callArgs = mockRecordOrderEvent.mock.calls[0][0] as { metadataPayload: string };
			const payload = JSON.parse(Buffer.from(callArgs.metadataPayload, 'hex').toString('utf8'));

			expect(typeof payload.ts).toBe('number');
			expect(payload.ts).toBeGreaterThanOrEqual(before);
			expect(payload.ts).toBeLessThanOrEqual(after);
		});

		it('includes data as an empty object (not null or omitted)', async () => {
			await submitPaidTrace('order-data-check');

			const callArgs = mockRecordOrderEvent.mock.calls[0][0] as { metadataPayload: string };
			const payload = JSON.parse(Buffer.from(callArgs.metadataPayload, 'hex').toString('utf8'));

			expect(payload.data).toEqual({});
		});
	});

	describe('client.recordOrderEvent call', () => {
		it('calls recordOrderEvent with the hex metadataPayload arg', async () => {
			await submitPaidTrace('order-args-check');

			expect(mockRecordOrderEvent).toHaveBeenCalledOnce();
			const args = mockRecordOrderEvent.mock.calls[0][0] as Record<string, unknown>;

			expect(typeof args.metadataPayload).toBe('string');
			// hex string: only 0-9 a-f chars
			expect(args.metadataPayload).toMatch(/^[0-9a-f]+$/);
		});

		it('injects the merchant party into the recordOrderEvent args', async () => {
			await submitPaidTrace('order-party-inject');

			const args = mockRecordOrderEvent.mock.calls[0][0] as Record<string, unknown>;
			expect(args.merchant).toBe(STUB_CONFIG.merchantAddress);
		});

		it('constructs Client with the endpoint and profile from network config', async () => {
			await submitPaidTrace('order-client-opts');

			expect(mockClientConstructor).toHaveBeenCalledOnce();
			expect(mockClientConstructor).toHaveBeenCalledWith({ endpoint: STUB_CONFIG.trpEndpoint }, STUB_CONFIG.profile);
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

	describe('client.submit call', () => {
		it('calls client.submit with the envelope tx content and witnesses from the signer', async () => {
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
});
