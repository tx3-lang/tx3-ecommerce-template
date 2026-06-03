/**
 * Oracle client factory.
 *
 * Single source of truth for constructing a configured `OracleClient` from the
 * `shipping-oracle-sdk`. Reads env vars on every call (no memoisation) so that
 * tests can inject different env values and `fetchFn` stubs per call.
 *
 * Required env vars:
 *   ORACLE_BASE_URL  — Base URL of the shipping oracle HTTP API (e.g. https://oracle.example.com)
 *
 * Optional env vars:
 *   ORACLE_PUBLIC_KEY  — Ed25519 public key hex; when set, attestation verification pins
 *                        the key so mis-signed responses are rejected.
 */

import { OracleClient } from 'shipping-oracle-sdk';

export type { OracleClientOptions } from 'shipping-oracle-sdk';

export interface OracleClientFactoryOptions {
	/**
	 * Override the global `fetch` used by the client. Useful for unit tests and
	 * e2e keeper stubs that need to control HTTP responses without a live oracle.
	 */
	fetchFn?: typeof fetch;
}

/**
 * Build and return a configured `OracleClient`.
 *
 * A fresh client is constructed on every call — no memoisation — so callers
 * can inject different `fetchFn` stubs or env values per invocation.
 *
 * @throws Error  `MISSING_ENV: ORACLE_BASE_URL` when `ORACLE_BASE_URL` is
 *                absent or empty.
 */
export function getOracleClient(opts?: OracleClientFactoryOptions): OracleClient {
	const baseUrl = requireEnv('ORACLE_BASE_URL');
	const expectedPublicKeyHex = process.env.ORACLE_PUBLIC_KEY || undefined;

	return new OracleClient(baseUrl, {
		expectedPublicKeyHex,
		fetchFn: opts?.fetchFn,
	});
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (value === undefined || value === '') {
		throw new Error(`MISSING_ENV: ${name}`);
	}
	return value;
}
