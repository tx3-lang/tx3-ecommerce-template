/**
 * Escrow orchestrator — lock path.
 *
 * Builds and submits the buyer's lock transaction that locks ADA or tokens into
 * the escrow smart contract. Unlike the traceability orchestrator, this uses the
 * CIP-30 browser wallet signer (buyer) rather than the backend signer.
 *
 * Relies on:
 *   - getNetworkConfig()      — trpEndpoint, profile, merchantAddress
 *   - getShipDeadlineSeconds() — ship deadline timeout in seconds
 *   - CIP-30 buyer signer     — signs the resolved tx via wallet.signTx()
 *   - Client (codegen facade) — lockEscrowAda / lockEscrowTokens + submit
 *
 * Note: script address routing is handled internally by tx3 via the embedded
 * script hash in the compiled protocol definition — no getScriptAddress() call
 * is needed here.
 */

import { bech32 } from 'bech32';
import { Buffer } from 'buffer';
import { Tag as CborTag, encode as cborEncode } from 'cbor-x';

import { decodeWitnessSet } from 'tx3-sdk/signer';
import type { TxEnvelope } from 'tx3-sdk/trp';
import type { ProfileName } from '@/lib/tx3/protocol';
import { Client } from '@/lib/tx3/protocol';

import { getShipDeadlineSeconds } from './escrow-policy.js';
import { getNetworkConfig } from './network.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** ADA-only value: just lovelace. */
export interface AdaValue {
	lovelace: bigint;
}

/** Token value: lovelace (min-ADA) + a native asset. */
export interface TokenValue {
	lovelace: bigint;
	policyId: string;
	assetName: string;
	quantity: bigint;
}

/** Discriminated union of supported escrow value shapes. */
export type EscrowValue = AdaValue | TokenValue;

/** Return value from a successful lock transaction. */
export interface LockResult {
	lockTxHash: string;
	lockOutputIndex: number;
	datumCbor: string;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isTokenValue(v: EscrowValue): v is TokenValue {
	return 'policyId' in v;
}

// ---------------------------------------------------------------------------
// Address utilities
// ---------------------------------------------------------------------------

/**
 * Extracts the 28-byte payment key hash (PKH) from a hex-encoded Cardano
 * address as returned by CIP-30 `getChangeAddress()`.
 *
 * Cardano address byte layout (Shelley):
 *   [header(1)] [pkh(28)] [optional staking credential(28)]
 *
 * The PKH is bytes [1..29) of the raw address bytes.
 */
function extractPkhFromHexAddress(addressHex: string): Buffer {
	const raw = Buffer.from(addressHex, 'hex');
	if (raw.length < 29) {
		throw new Error(`INVALID_ADDRESS: address too short to contain a PKH (${raw.length} bytes)`);
	}
	return raw.slice(1, 29);
}

/**
 * Extracts the 28-byte PKH from a bech32-encoded Cardano address
 * (addr1... or addr_test1...).
 */
function extractPkhFromBech32Address(address: string): Buffer {
	let decoded: { prefix: string; words: number[] };
	try {
		decoded = bech32.decode(address, 1000);
	} catch {
		throw new Error(`INVALID_ADDRESS: bech32 decode failed for "${address}"`);
	}
	const raw = Buffer.from(bech32.fromWords(decoded.words));
	if (raw.length < 29) {
		throw new Error(`INVALID_ADDRESS: address too short to contain a PKH (${raw.length} bytes)`);
	}
	return raw.slice(1, 29);
}

// ---------------------------------------------------------------------------
// Datum CBOR construction
// ---------------------------------------------------------------------------

/**
 * Builds the CBOR-encoded EscrowDatum as a hex string.
 *
 * Plutus constr(0, [buyerPkh, merchantPkh, orderId, paidAt, shipDeadline, None])
 * is encoded as CBOR tag 121 wrapping a 6-element array.
 *
 * `grace_period_end` is always `OptionInt::None` on lock — CBOR tag 121, [].
 */
function buildDatumCbor(
	buyerPkh: Buffer,
	merchantPkh: Buffer,
	orderId: string,
	paidAt: number,
	shipDeadline: number,
): string {
	const noneConstr = new CborTag([], 121);
	const datum = new CborTag(
		[buyerPkh, merchantPkh, Buffer.from(orderId, 'utf8'), paidAt, shipDeadline, noneConstr],
		121,
	);
	return cborEncode(datum).toString('hex');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds and submits the buyer's escrow lock transaction.
 *
 * Steps:
 * 1. Read network config and escrow policy config.
 * 2. Derive buyer PKH from the CIP-30 change address.
 * 3. Derive merchant PKH from the merchant address in network config.
 * 4. Compute `paid_at` (now ms) and `ship_deadline`.
 * 5. Build the datum CBOR.
 * 6. Resolve the lock tx via the codegen Client.
 * 7. Sign with the buyer's CIP-30 wallet (partialSign=true).
 * 8. Submit.
 * 9. Return `{ lockTxHash, lockOutputIndex, datumCbor }`.
 *
 * The lock output is always at index 0 in the tx3-generated transaction
 * (the first output is always the script output per the TIR spec).
 */
export async function submitLockEscrow(
	orderId: string,
	value: EscrowValue,
	buyerSigner: CardanoWalletAPI,
): Promise<LockResult> {
	const { trpEndpoint, profile, merchantAddress } = getNetworkConfig();
	const shipDeadlineSeconds = getShipDeadlineSeconds();

	// Build timestamps
	const paidAt = Date.now();
	const shipDeadline = paidAt + shipDeadlineSeconds * 1000;

	// Derive buyer PKH from CIP-30 change address (hex-encoded)
	const buyerAddressHex = await buyerSigner.getChangeAddress();
	const buyerPkh = extractPkhFromHexAddress(buyerAddressHex);

	// Derive merchant PKH from the configured merchant bech32 address
	const merchantPkh = extractPkhFromBech32Address(merchantAddress);

	// Build the datum CBOR (for return value)
	const datumCbor = buildDatumCbor(buyerPkh, merchantPkh, orderId, paidAt, shipDeadline);

	// Construct the protocol client
	const client = new Client({ endpoint: trpEndpoint }, profile as ProfileName);

	// Resolve the appropriate lock tx based on value shape
	let envelope: TxEnvelope;
	if (isTokenValue(value)) {
		// Safe for ADA (max 45B ADA = 4.5e16 lovelace < 2^53) and NFT quantities;
		// large fungible token supplies may lose precision.
		envelope = await client.lockEscrowTokens({
			buyerPkh,
			merchantPkh,
			orderId: Buffer.from(orderId, 'utf8'),
			paidAt,
			shipDeadline,
			minAda: Number(value.lovelace),
			tokenPolicy: Buffer.from(value.policyId, 'hex'),
			assetName: Buffer.from(value.assetName, 'hex'),
			tokenQuantity: Number(value.quantity),
		} as Parameters<typeof client.lockEscrowTokens>[0]);
	} else {
		// Safe for ADA (max 45B ADA = 4.5e16 lovelace < 2^53) and NFT quantities;
		// large fungible token supplies may lose precision.
		envelope = await client.lockEscrowAda({
			buyerPkh,
			merchantPkh,
			orderId: Buffer.from(orderId, 'utf8'),
			paidAt,
			shipDeadline,
			quantity: Number(value.lovelace),
		} as Parameters<typeof client.lockEscrowAda>[0]);
	}

	// Sign the resolved tx with the buyer's CIP-30 wallet (partial sign = true)
	const witnessSetCborHex = await buyerSigner.signTx(envelope.tx, true);

	// Decode the CIP-30 witness set into TxWitness[] for TRP submission
	const witnesses = decodeWitnessSet(witnessSetCborHex);

	// Submit
	await client.submit({
		tx: { content: envelope.tx, contentType: 'hex' },
		witnesses,
	} satisfies Parameters<typeof client.submit>[0]);

	// The lock output is always at index 0 per the tx3 TIR spec
	const lockOutputIndex = 0;

	return {
		lockTxHash: envelope.hash,
		lockOutputIndex,
		datumCbor,
	};
}
