/**
 * Oracle fixture helpers for keeper-driven e2e tests.
 *
 * Provides:
 *  - A fixed Ed25519 test key pair (deterministic, test-only).
 *  - `buildSignedAttestation` — produces a byte-correct signed OracleAttestation
 *    using the SDK's `encodeOracleDataCbor` so that `verifyAttestation` accepts it.
 *  - `makeOracleStubFetch` — a `fetch`-compatible function that parses
 *    carrier + tracking_number from the request URL and returns a signed attestation.
 *  - `makeStubOracleClient` — constructs an `OracleClient` wired to the stub fetch.
 *
 * Crypto notes:
 *  - Repo has @noble/curves@^2 and @noble/hashes@^2.
 *  - The SDK bundles no nested noble — it uses the repo's noble at runtime.
 *  - v2 API: ed25519.sign(msg, privKey), ed25519.getPublicKey(privKey).
 *  - blake2b is imported from '@noble/hashes/blake2.js' (renamed in v2; was
 *    '@noble/hashes/blake2b' in v1).
 *  - The fixture self-check (oracle_fixture.e2e.ts) proves cross-version
 *    sign/verify works before any dolos test runs.
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { blake2b } from '@noble/hashes/blake2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { OracleClient, encodeOracleDataCbor } from 'shipping-oracle-sdk';
import type { OracleAttestation, OracleStatus } from 'shipping-oracle-sdk';

// ---------------------------------------------------------------------------
// Fixed test key pair (deterministic, test-only — never use in production)
// ---------------------------------------------------------------------------

/** 32-byte Ed25519 private key for oracle attestation signing in tests. */
export const TEST_ORACLE_SECRET_KEY_HEX =
	'0101010101010101010101010101010101010101010101010101010101010101';

/** Derived Ed25519 public key (hex) — computed from TEST_ORACLE_SECRET_KEY_HEX. */
export const TEST_ORACLE_PUBLIC_KEY_HEX: string = bytesToHex(
	ed25519.getPublicKey(hexToBytes(TEST_ORACLE_SECRET_KEY_HEX)),
);

// ---------------------------------------------------------------------------
// Default timestamp (fixed, deterministic — do NOT call Date.now() at module scope)
// ---------------------------------------------------------------------------

const DEFAULT_TIMESTAMP = 1_700_000_000; // 2023-11-14T22:13:20Z

// ---------------------------------------------------------------------------
// buildSignedAttestation
// ---------------------------------------------------------------------------

export interface BuildSignedAttestationParams {
	carrier: string;
	trackingNumber: string;
	status: OracleStatus;
	/** Unix seconds. Defaults to DEFAULT_TIMESTAMP for deterministic tests. */
	timestamp?: number;
}

/**
 * Build a fully-signed OracleAttestation accepted by the SDK's `verifyAttestation`.
 *
 * Signing:
 *   1. blake2b-256 the carrier and trackingNumber (matching what verifyAttestation checks).
 *   2. Encode OracleData via `encodeOracleDataCbor` (same path verifyAttestation re-encodes).
 *   3. Ed25519 sign over the raw CBOR bytes (NOT the hex string).
 */
export function buildSignedAttestation(params: BuildSignedAttestationParams): OracleAttestation {
	const { carrier, trackingNumber, status, timestamp = DEFAULT_TIMESTAMP } = params;

	// Hash carrier and tracking_number (blake2b-256 of UTF-8 bytes)
	const encoder = new TextEncoder();
	const carrierHash = bytesToHex(blake2b(encoder.encode(carrier), { dkLen: 32 }));
	const trackingHash = bytesToHex(blake2b(encoder.encode(trackingNumber), { dkLen: 32 }));

	const data = {
		carrier_hash: carrierHash,
		tracking_number_hash: trackingHash,
		status,
		timestamp,
	};

	// CBOR-encode the data (same function verifyAttestation uses for re-encoding check)
	const cborBytes = encodeOracleDataCbor(data);
	const cborHex = bytesToHex(cborBytes);

	// Sign over the RAW CBOR bytes (not the hex string)
	const privKey = hexToBytes(TEST_ORACLE_SECRET_KEY_HEX);
	const sigBytes = ed25519.sign(cborBytes, privKey);
	const signature = bytesToHex(sigBytes);

	return {
		data,
		plaintext: {
			carrier,
			tracking_number: trackingNumber,
		},
		signature,
		public_key: TEST_ORACLE_PUBLIC_KEY_HEX,
		cbor_hex: cborHex,
	};
}

// ---------------------------------------------------------------------------
// makeOracleStubFetch
// ---------------------------------------------------------------------------

/**
 * Returns a `fetch`-compatible function that intercepts oracle HTTP requests
 * and returns a signed attestation for the carrier + tracking_number in the URL.
 *
 * The SDK client calls:
 *   GET {base}/v1/shipment?carrier=<c>&tracking_number=<t>
 * and expects the response body to be a JSON-encoded OracleAttestation.
 */
export function makeOracleStubFetch(status: OracleStatus): typeof fetch {
	return async (input: string | URL | Request): Promise<Response> => {
		const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

		const carrier = url.searchParams.get('carrier') ?? '';
		const trackingNumber = url.searchParams.get('tracking_number') ?? '';

		const attestation = buildSignedAttestation({ carrier, trackingNumber, status });

		return new Response(JSON.stringify(attestation), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	};
}

// ---------------------------------------------------------------------------
// makeStubOracleClient
// ---------------------------------------------------------------------------

/**
 * Returns an OracleClient wired to the stub fetch function.
 *
 * Because the client is injected into `settleEscrows({ oracleClient })`, the
 * keeper does NOT need any ORACLE_* env var to run in tests.
 */
export function makeStubOracleClient(status: OracleStatus): OracleClient {
	return new OracleClient('http://oracle.stub', {
		expectedPublicKeyHex: TEST_ORACLE_PUBLIC_KEY_HEX,
		fetchFn: makeOracleStubFetch(status),
	});
}
