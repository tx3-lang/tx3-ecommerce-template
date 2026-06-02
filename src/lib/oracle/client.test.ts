import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the ctor spy so vi.mock (which is hoisted before imports) can reference it.
const ctorSpy = vi.hoisted(() => vi.fn());

vi.mock('shipping-oracle-sdk', () => ({
	OracleClient: function OracleClient(baseUrl: string, options: unknown) {
		ctorSpy(baseUrl, options);
	},
}));

// Import under test AFTER vi.mock so the mock is in place.
import { getOracleClient } from './client.js';

const VALID_ENV = {
	ORACLE_BASE_URL: 'https://oracle.example.com',
	ORACLE_PUBLIC_KEY: 'aabbccddeeff0011223344556677889900aabbccddeeff001122334455667788',
};

beforeEach(() => {
	for (const [key, value] of Object.entries(VALID_ENV)) {
		process.env[key] = value;
	}
	ctorSpy.mockClear();
});

afterEach(() => {
	for (const key of Object.keys(VALID_ENV)) {
		delete process.env[key];
	}
});

describe('getOracleClient', () => {
	describe('ORACLE_BASE_URL validation', () => {
		it('throws MISSING_ENV: ORACLE_BASE_URL when env var is unset', () => {
			delete process.env.ORACLE_BASE_URL;
			expect(() => getOracleClient()).toThrow('MISSING_ENV: ORACLE_BASE_URL');
		});

		it('throws MISSING_ENV: ORACLE_BASE_URL when env var is an empty string', () => {
			process.env.ORACLE_BASE_URL = '';
			expect(() => getOracleClient()).toThrow('MISSING_ENV: ORACLE_BASE_URL');
		});
	});

	describe('constructs OracleClient with correct args', () => {
		it('passes baseUrl from ORACLE_BASE_URL', () => {
			getOracleClient();
			expect(ctorSpy).toHaveBeenCalledOnce();
			expect(ctorSpy.mock.calls[0][0]).toBe(VALID_ENV.ORACLE_BASE_URL);
		});

		it('passes expectedPublicKeyHex from ORACLE_PUBLIC_KEY when set', () => {
			getOracleClient();
			expect(ctorSpy).toHaveBeenCalledOnce();
			const options = ctorSpy.mock.calls[0][1] as Record<string, unknown>;
			expect(options.expectedPublicKeyHex).toBe(VALID_ENV.ORACLE_PUBLIC_KEY);
		});

		it('passes expectedPublicKeyHex as undefined when ORACLE_PUBLIC_KEY is unset', () => {
			delete process.env.ORACLE_PUBLIC_KEY;
			getOracleClient();
			expect(ctorSpy).toHaveBeenCalledOnce();
			const options = ctorSpy.mock.calls[0][1] as Record<string, unknown>;
			expect(options.expectedPublicKeyHex).toBeUndefined();
		});

		it('passes expectedPublicKeyHex as undefined when ORACLE_PUBLIC_KEY is empty string', () => {
			process.env.ORACLE_PUBLIC_KEY = '';
			getOracleClient();
			expect(ctorSpy).toHaveBeenCalledOnce();
			const options = ctorSpy.mock.calls[0][1] as Record<string, unknown>;
			expect(options.expectedPublicKeyHex).toBeUndefined();
		});
	});

	describe('fetchFn injection', () => {
		it('forwards an injected fetchFn to the OracleClient options', () => {
			const stubFetch = vi.fn() as unknown as typeof fetch;
			getOracleClient({ fetchFn: stubFetch });
			expect(ctorSpy).toHaveBeenCalledOnce();
			const options = ctorSpy.mock.calls[0][1] as Record<string, unknown>;
			expect(options.fetchFn).toBe(stubFetch);
		});

		it('passes fetchFn as undefined when no options are provided', () => {
			getOracleClient();
			expect(ctorSpy).toHaveBeenCalledOnce();
			const options = ctorSpy.mock.calls[0][1] as Record<string, unknown>;
			expect(options.fetchFn).toBeUndefined();
		});
	});

	describe('no memoisation', () => {
		it('builds a fresh client on each call', () => {
			getOracleClient();
			getOracleClient();
			expect(ctorSpy).toHaveBeenCalledTimes(2);
		});
	});
});
