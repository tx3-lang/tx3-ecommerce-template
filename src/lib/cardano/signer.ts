/**
 * Merchant signer module.
 *
 * Single source of truth for the backend Ed25519 signing key. Reads
 * CARDANO_MERCHANT_SKEY (hex-encoded Ed25519 private key) from env once,
 * derives the public key, and exposes a sign() method that produces
 * TxWitness[] shaped for tx3-sdk/trp v0.11.0.
 *
 * BytesEnvelope in v0.11.0 uses `contentType: "hex"` instead of `encoding: "hex"`.
 *
 * Required env vars:
 *   CARDANO_MERCHANT_SKEY — 64 hex chars (32 bytes), Ed25519 private key
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { Buffer } from 'buffer';
import type { TxWitness } from 'tx3-sdk/trp';

// --- Signer interface ---

export interface Signer {
	/** Returns the derived Ed25519 public key as a lowercase hex string. */
	publicKeyHex(): string;
	/** Signs a transaction body hash and returns tx3-sdk/trp TxWitness[]. */
	sign(txHashHex: string): TxWitness[];
}

// --- Module-level memoised singleton ---

let _signer: Signer | null = null;

/**
 * Returns the memoised merchant signer. Throws on first call if
 * CARDANO_MERCHANT_SKEY is missing or invalid.
 */
export function getMerchantSigner(): Signer {
	if (_signer !== null) {
		return _signer;
	}

	const skeyHex = process.env.CARDANO_MERCHANT_SKEY;
	if (!skeyHex) {
		throw new Error('MISSING_ENV: CARDANO_MERCHANT_SKEY');
	}

	// Validate: must be exactly 64 lowercase/uppercase hex chars (32 bytes)
	if (!/^[0-9a-fA-F]{64}$/.test(skeyHex)) {
		throw new Error('INVALID_ENV: CARDANO_MERCHANT_SKEY must be 64 hex chars');
	}

	const privateKeyBytes = Buffer.from(skeyHex, 'hex');
	const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
	const cachedPublicKeyHex = Buffer.from(publicKeyBytes).toString('hex');

	_signer = {
		publicKeyHex(): string {
			return cachedPublicKeyHex;
		},

		sign(txHashHex: string): TxWitness[] {
			const txHashBytes = Buffer.from(txHashHex, 'hex');
			const signature = ed25519.sign(txHashBytes, privateKeyBytes);

			return [
				{
					type: 'vkey',
					key: {
						content: cachedPublicKeyHex,
						contentType: 'hex',
					},
					signature: {
						content: Buffer.from(signature).toString('hex'),
						contentType: 'hex',
					},
				},
			];
		},
	};

	return _signer;
}
