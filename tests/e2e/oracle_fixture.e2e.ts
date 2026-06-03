/**
 * Dolos-INDEPENDENT fixture self-check for the oracle attestation fixture.
 *
 * Proves that `buildSignedAttestation` produces a byte-correct signed attestation
 * that the SDK's `verifyAttestation` accepts. This suite runs WITHOUT a skip
 * guard — it passes even when the dolos e2e env is not configured.
 *
 * Run via: pnpm test:e2e
 */

import { describe, expect, it } from 'vitest';

import { OracleSdkError, verifyAttestation } from 'shipping-oracle-sdk';

import {
	TEST_ORACLE_PUBLIC_KEY_HEX,
	buildSignedAttestation,
} from './_fixtures/oracle.js';

describe('oracle_fixture — signed attestation self-check', () => {
	it('verifyAttestation accepts a correctly-signed attestation', () => {
		const attestation = buildSignedAttestation({
			carrier: 'fedex',
			trackingNumber: 'TRK-1',
			status: 'DELIVERED',
		});

		// Must NOT throw
		expect(() =>
			verifyAttestation(attestation, {
				expectedPublicKeyHex: TEST_ORACLE_PUBLIC_KEY_HEX,
			}),
		).not.toThrow();
	});

	it('verifyAttestation throws UNEXPECTED_PUBLIC_KEY for a wrong expected key', () => {
		const attestation = buildSignedAttestation({
			carrier: 'fedex',
			trackingNumber: 'TRK-1',
			status: 'DELIVERED',
		});

		// A different 32-byte hex key (all zeros — not the signing key)
		const wrongKey = '0'.repeat(64);

		expect(() =>
			verifyAttestation(attestation, { expectedPublicKeyHex: wrongKey }),
		).toThrow(OracleSdkError);

		try {
			verifyAttestation(attestation, { expectedPublicKeyHex: wrongKey });
		} catch (e) {
			expect(e).toBeInstanceOf(OracleSdkError);
			expect((e as OracleSdkError).code).toBe('UNEXPECTED_PUBLIC_KEY');
		}
	});

	it('verifyAttestation throws INVALID_SIGNATURE when the signature is tampered', () => {
		const attestation = buildSignedAttestation({
			carrier: 'fedex',
			trackingNumber: 'TRK-1',
			status: 'DELIVERED',
		});

		// Flip the first byte of the signature
		const tamperedSig = 'ff' + attestation.signature.slice(2);
		const tampered = { ...attestation, signature: tamperedSig };

		expect(() =>
			verifyAttestation(tampered, {
				expectedPublicKeyHex: TEST_ORACLE_PUBLIC_KEY_HEX,
			}),
		).toThrow(OracleSdkError);

		try {
			verifyAttestation(tampered, {
				expectedPublicKeyHex: TEST_ORACLE_PUBLIC_KEY_HEX,
			});
		} catch (e) {
			expect(e).toBeInstanceOf(OracleSdkError);
			expect((e as OracleSdkError).code).toBe('INVALID_SIGNATURE');
		}
	});

	it('verifyAttestation accepts IN_TRANSIT status', () => {
		const attestation = buildSignedAttestation({
			carrier: 'ups',
			trackingNumber: 'E2E-ORACLE-DELIVERY',
			status: 'IN_TRANSIT',
		});

		expect(() =>
			verifyAttestation(attestation, {
				expectedPublicKeyHex: TEST_ORACLE_PUBLIC_KEY_HEX,
			}),
		).not.toThrow();
	});

	it('verifyAttestation accepts a custom timestamp', () => {
		const attestation = buildSignedAttestation({
			carrier: 'dhl',
			trackingNumber: 'TRK-CUSTOM-TS',
			status: 'PRE_TRANSIT',
			timestamp: 1_750_000_000,
		});

		expect(() =>
			verifyAttestation(attestation, {
				expectedPublicKeyHex: TEST_ORACLE_PUBLIC_KEY_HEX,
			}),
		).not.toThrow();
	});
});
