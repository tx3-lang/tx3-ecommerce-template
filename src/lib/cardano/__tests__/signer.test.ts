import { ed25519 } from '@noble/curves/ed25519.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A well-formed 32-byte Ed25519 private key (deterministic, test-only)
const VALID_SKEY_HEX = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae3d55';

// Helper: load a fresh copy of the signer module (resets memoisation)
const loadFresh = async () => {
	vi.resetModules();
	const mod = await import('../signer.js');
	return mod;
};

beforeEach(() => {
	process.env.CARDANO_MERCHANT_SKEY = VALID_SKEY_HEX;
});

afterEach(() => {
	delete process.env.CARDANO_MERCHANT_SKEY;
	vi.resetModules();
});

describe('getMerchantSigner', () => {
	describe('sign()', () => {
		it('returns an array with one SubmitWitness of type "vkey"', async () => {
			const { getMerchantSigner } = await loadFresh();
			const txHashHex = 'a'.repeat(64); // 32-byte hash
			const witnesses = getMerchantSigner().sign(txHashHex);
			expect(witnesses).toHaveLength(1);
			expect(witnesses[0].type).toBe('vkey');
		});

		it('witness key has encoding "hex"', async () => {
			const { getMerchantSigner } = await loadFresh();
			const witnesses = getMerchantSigner().sign('b'.repeat(64));
			expect(witnesses[0].key.encoding).toBe('hex');
		});

		it('witness signature has encoding "hex"', async () => {
			const { getMerchantSigner } = await loadFresh();
			const witnesses = getMerchantSigner().sign('c'.repeat(64));
			expect(witnesses[0].signature.encoding).toBe('hex');
		});

		it('produces a signature verifiable against the derived public key', async () => {
			const { getMerchantSigner } = await loadFresh();
			const txHashHex = 'deadbeef'.repeat(8); // 32 bytes
			const signer = getMerchantSigner();
			const witnesses = signer.sign(txHashHex);

			const pubKeyHex = witnesses[0].key.content;
			const sigHex = witnesses[0].signature.content;

			const pubKeyBytes = Buffer.from(pubKeyHex, 'hex');
			const sigBytes = Buffer.from(sigHex, 'hex');
			const msgBytes = Buffer.from(txHashHex, 'hex');

			const valid = ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
			expect(valid).toBe(true);
		});
	});

	describe('publicKeyHex()', () => {
		it('returns a 64-character hex string (32 bytes)', async () => {
			const { getMerchantSigner } = await loadFresh();
			const pubKey = getMerchantSigner().publicKeyHex();
			expect(pubKey).toMatch(/^[0-9a-f]{64}$/);
		});

		it('is consistent with the key returned in sign() witness', async () => {
			const { getMerchantSigner } = await loadFresh();
			const signer = getMerchantSigner();
			const pubKeyFromMethod = signer.publicKeyHex();
			const witnesses = signer.sign('ff'.repeat(32));
			expect(witnesses[0].key.content).toBe(pubKeyFromMethod);
		});
	});

	describe('memoisation', () => {
		it('returns the same instance on repeated calls within the same module', async () => {
			const { getMerchantSigner } = await loadFresh();
			const first = getMerchantSigner();
			const second = getMerchantSigner();
			expect(first).toBe(second);
		});
	});

	describe('env validation', () => {
		it('throws MISSING_ENV error when CARDANO_MERCHANT_SKEY is not set', async () => {
			delete process.env.CARDANO_MERCHANT_SKEY;
			const { getMerchantSigner } = await loadFresh();
			expect(() => getMerchantSigner()).toThrow('MISSING_ENV: CARDANO_MERCHANT_SKEY');
		});

		it('throws MISSING_ENV error when CARDANO_MERCHANT_SKEY is an empty string', async () => {
			process.env.CARDANO_MERCHANT_SKEY = '';
			const { getMerchantSigner } = await loadFresh();
			expect(() => getMerchantSigner()).toThrow('MISSING_ENV: CARDANO_MERCHANT_SKEY');
		});

		it('throws INVALID_ENV error when CARDANO_MERCHANT_SKEY is not 64 hex chars', async () => {
			process.env.CARDANO_MERCHANT_SKEY = 'aabbcc'; // too short
			const { getMerchantSigner } = await loadFresh();
			expect(() => getMerchantSigner()).toThrow('INVALID_ENV: CARDANO_MERCHANT_SKEY must be 64 hex chars');
		});

		it('throws INVALID_ENV error when CARDANO_MERCHANT_SKEY has wrong length (63 chars)', async () => {
			process.env.CARDANO_MERCHANT_SKEY = 'a'.repeat(63);
			const { getMerchantSigner } = await loadFresh();
			expect(() => getMerchantSigner()).toThrow('INVALID_ENV: CARDANO_MERCHANT_SKEY must be 64 hex chars');
		});

		it('throws INVALID_ENV error when CARDANO_MERCHANT_SKEY has wrong length (65 chars)', async () => {
			process.env.CARDANO_MERCHANT_SKEY = 'a'.repeat(65);
			const { getMerchantSigner } = await loadFresh();
			expect(() => getMerchantSigner()).toThrow('INVALID_ENV: CARDANO_MERCHANT_SKEY must be 64 hex chars');
		});

		it('throws INVALID_ENV error when CARDANO_MERCHANT_SKEY contains non-hex chars', async () => {
			process.env.CARDANO_MERCHANT_SKEY = 'z'.repeat(64);
			const { getMerchantSigner } = await loadFresh();
			expect(() => getMerchantSigner()).toThrow('INVALID_ENV: CARDANO_MERCHANT_SKEY must be 64 hex chars');
		});
	});
});
