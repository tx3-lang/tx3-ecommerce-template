/**
 * Tests for u5c-client.ts
 *
 * Verifies that the wrapper:
 * - Forwards resolve() calls to the underlying Client and returns its result.
 * - Forwards submit() calls to the underlying Client.
 * - Wraps transport errors in a typed ChainUnavailable error with the original cause attached.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Shared mock functions — set up before vi.mock so the factory closure captures them
const mockResolve = vi.fn();
const mockSubmit = vi.fn();
const mockClientConstructor = vi.fn();

vi.mock('tx3-sdk/trp', () => {
	// Use a named function so `new Client(opts)` works as a constructor call.
	// The constructor spy records call args; the returned instance delegates to
	// the shared mock fns.
	function Client(options: unknown) {
		mockClientConstructor(options);
		return { resolve: mockResolve, submit: mockSubmit };
	}

	return {
		Client,
		TRPClient: Client,
	};
});

// Import after mocking so the module under test picks up the mock
const { ChainUnavailable, createU5cClient } = await import('../u5c-client.js');

const STUB_CONFIG = {
	trpEndpoint: 'http://localhost:50051',
	profile: 'local' as const,
	metadataLabel: 1337,
	merchantAddress: 'addr1qtest',
};

const FAKE_PROTO_TX = {
	tir: { version: '1', content: 'abc', encoding: 'base64' },
	args: {},
};

const FAKE_SUBMIT_PARAMS = {
	tx: { content: 'deadbeef', encoding: 'hex' as const },
	witnesses: [],
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('createU5cClient', () => {
	describe('resolve', () => {
		it('forwards the request to TRP Client.resolve and returns its result', async () => {
			const expectedEnvelope = { hash: 'abc123', tx: 'cafebabe' };
			mockResolve.mockResolvedValueOnce(expectedEnvelope);

			const client = createU5cClient(STUB_CONFIG);
			const result = await client.resolve(FAKE_PROTO_TX);

			expect(mockResolve).toHaveBeenCalledOnce();
			expect(mockResolve).toHaveBeenCalledWith(FAKE_PROTO_TX);
			expect(result).toEqual(expectedEnvelope);
		});

		it('constructs the TRP Client with the endpoint from config', () => {
			createU5cClient(STUB_CONFIG);
			expect(mockClientConstructor).toHaveBeenCalledOnce();
			expect(mockClientConstructor).toHaveBeenCalledWith(
				expect.objectContaining({ endpoint: STUB_CONFIG.trpEndpoint }),
			);
		});

		it('wraps a resolve transport error in ChainUnavailable with the original cause', async () => {
			const originalError = new Error('connection refused');
			mockResolve.mockRejectedValueOnce(originalError);

			const client = createU5cClient(STUB_CONFIG);

			let caught: unknown;
			try {
				await client.resolve(FAKE_PROTO_TX);
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(ChainUnavailable);
			expect((caught as InstanceType<typeof ChainUnavailable>).cause).toBe(originalError);
		});
	});

	describe('submit', () => {
		it('forwards the request to TRP Client.submit', async () => {
			mockSubmit.mockResolvedValueOnce(undefined);

			const client = createU5cClient(STUB_CONFIG);
			await client.submit(FAKE_SUBMIT_PARAMS);

			expect(mockSubmit).toHaveBeenCalledOnce();
			expect(mockSubmit).toHaveBeenCalledWith(FAKE_SUBMIT_PARAMS);
		});

		it('wraps a submit transport error in ChainUnavailable with the original cause', async () => {
			const originalError = new Error('network timeout');
			mockSubmit.mockRejectedValueOnce(originalError);

			const client = createU5cClient(STUB_CONFIG);

			let caught: unknown;
			try {
				await client.submit(FAKE_SUBMIT_PARAMS);
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(ChainUnavailable);
			expect((caught as InstanceType<typeof ChainUnavailable>).cause).toBe(originalError);
		});
	});

	describe('ChainUnavailable', () => {
		it('is an instance of Error', () => {
			const err = new ChainUnavailable('oops', new Error('cause'));
			expect(err).toBeInstanceOf(Error);
		});

		it('carries the original error as cause', () => {
			const cause = new Error('underlying');
			const err = new ChainUnavailable('chain is down', cause);
			expect(err.cause).toBe(cause);
		});

		it('has the message passed to the constructor', () => {
			const err = new ChainUnavailable('chain is down', new Error('x'));
			expect(err.message).toBe('chain is down');
		});
	});
});
