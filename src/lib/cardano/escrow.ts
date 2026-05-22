/**
 * Escrow orchestrator — lock + state-transition paths.
 *
 * Builds and submits buyer/merchant escrow transactions:
 *   - submitLockEscrow:     buyer locks ADA/tokens into the contract (CIP-30)
 *   - submitMarkShipped:    merchant marks order as shipped (backend signer)
 *   - submitReleaseEscrow:  merchant releases funds after grace period (backend signer)
 *   - submitRefundEscrow:   buyer claims refund (CIP-30)
 *
 * Relies on:
 *   - getNetworkConfig()        — trpEndpoint, profile, merchantAddress
 *   - getShipDeadlineSeconds()  — ship deadline timeout in seconds
 *   - getGracePeriodSeconds()   — grace period timeout in seconds
 *   - getMerchantSigner()       — backend Ed25519 signer (markShipped, releaseEscrow)
 *   - CIP-30 buyer signer       — signs via wallet.signTx() (lockEscrow, refundEscrow)
 *   - Client (codegen facade)   — protocol method dispatch + submit
 *   - getEscrowByOrderId()      — reads escrow row for state-transition functions
 *
 * Note: script address routing is handled internally by tx3 via the embedded
 * script hash in the compiled protocol definition — no getScriptAddress() call
 * is needed here.
 */

import { bech32 } from 'bech32';
import { Buffer } from 'buffer';
import { Tag as CborTag, encode as cborEncode } from 'cbor-x';

import { decodeWitnessSet } from 'tx3-sdk/signer';
import type { TxEnvelope, TxWitness } from 'tx3-sdk/trp';
import type { ProfileName } from '@/lib/tx3/protocol';
import { Client } from '@/lib/tx3/protocol';

import { getEscrowByOrderId } from '@/server-fns/escrows.js';

import { getGracePeriodSeconds, getShipDeadlineSeconds } from './escrow-policy.js';
import { getNetworkConfig } from './network.js';
import { getMerchantSigner } from './signer.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Minimal signer interface for buyer-driven escrow state transitions.
 *
 * Accepts the pre-computed tx body hash (hex) so implementations can sign
 * the hash directly — without needing to CBOR-decode/re-encode the full tx.
 * This avoids the CBOR round-trip bug where decode+re-encode may not produce
 * byte-identical bytes, which would cause an invalid signature on-chain.
 *
 * The chain verifies signatures against the original tx body bytes hash,
 * not a re-encoded version, so callers must sign `envelope.hash` directly.
 */
export interface BuyerSigner {
	/**
	 * Signs the tx body hash and returns a vkey witness.
	 * @param txBodyHash - hex-encoded 32-byte tx body hash (blake2b-256)
	 */
	signTxBodyHash(txBodyHash: string): Promise<{ vkey: string; signature: string }>;
}

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
	/** Unix timestamp (ms) when the escrow was locked — matches the on-chain datum field. */
	paidAt: number;
	/** Unix timestamp (ms) of the ship deadline — matches the on-chain datum field. */
	shipDeadline: number;
	/** Hex-encoded 28-byte buyer payment key hash. */
	buyerPkh: string;
	/** Hex-encoded 28-byte merchant payment key hash. */
	merchantPkh: string;
}

/** Return value from submitMarkShipped. */
export interface MarkShippedResult {
	txHash: string;
	newUtxoRef: { txHash: string; outputIndex: number };
	newDatumCbor: string;
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
	const { trpEndpoint, trpApiKey, profile, merchantAddress } = getNetworkConfig();
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
	const clientOptions = trpApiKey
		? { endpoint: trpEndpoint, headers: { 'dmtr-api-key': trpApiKey } }
		: { endpoint: trpEndpoint };
	const client = new Client(clientOptions, profile as ProfileName);

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
		paidAt,
		shipDeadline,
		buyerPkh: buyerPkh.toString('hex'),
		merchantPkh: merchantPkh.toString('hex'),
	};
}

// ---------------------------------------------------------------------------
// Datum CBOR construction — shipped datum (with grace_period_end = Some(ms))
// ---------------------------------------------------------------------------

/**
 * Builds the CBOR-encoded EscrowDatum for the shipped state.
 *
 * Same structure as the lock datum but `grace_period_end` is
 * `OptionInt::Some(gracePeriodEndMs)` — CBOR tag 122 wrapping the value.
 */
function buildShippedDatumCbor(
	buyerPkh: Buffer,
	merchantPkh: Buffer,
	orderId: Buffer,
	paidAt: number,
	shipDeadline: number,
	gracePeriodEndMs: number,
): string {
	// OptionInt::Some(value) = CBOR tag 122 (Plutus CONSTR 1) wrapping [value]
	const someConstr = new CborTag([gracePeriodEndMs], 122);
	const datum = new CborTag([buyerPkh, merchantPkh, orderId, paidAt, shipDeadline, someConstr], 121);
	return cborEncode(datum).toString('hex');
}

// ---------------------------------------------------------------------------
// Shared private pipeline helper for backend-signer state transitions
// ---------------------------------------------------------------------------

/**
 * Shared pipeline for merchant-driven escrow state transitions.
 *
 * 1. Construct the protocol Client.
 * 2. Resolve the tx via the provided factory function.
 * 3. Sign the resolved tx hash with the backend merchant signer.
 * 4. Submit the signed tx.
 * 5. Return the tx envelope.
 */
async function resolveSignAndSubmitWithBackendSigner(
	buildTx: (client: Client) => Promise<TxEnvelope>,
): Promise<TxEnvelope> {
	const { trpEndpoint, trpApiKey, profile } = getNetworkConfig();

	const clientOptions = trpApiKey
		? { endpoint: trpEndpoint, headers: { 'dmtr-api-key': trpApiKey } }
		: { endpoint: trpEndpoint };
	const client = new Client(clientOptions, profile as ProfileName);

	const envelope = await buildTx(client);

	const witnesses = getMerchantSigner().sign(envelope.hash);

	await client.submit({
		tx: { content: envelope.tx, contentType: 'hex' },
		witnesses,
	} satisfies Parameters<typeof client.submit>[0]);

	return envelope;
}

// ---------------------------------------------------------------------------
// Public API — state transitions
// ---------------------------------------------------------------------------

/**
 * Builds and submits the `mark_shipped` transaction.
 *
 * 1. Read current escrow row.
 * 2. Compute shipped_at and grace_period_end timestamps.
 * 3. Build markShipped tx with escrowUtxo, shippedAt, gracePeriodEnd.
 * 4. Sign with backend merchant signer.
 * 5. Submit.
 * 6. Rebuild new datum CBOR (with grace_period_end = Some(ms)).
 * 7. Return { txHash, newUtxoRef, newDatumCbor }.
 */
export async function submitMarkShipped(orderId: string): Promise<MarkShippedResult> {
	const escrow = await getEscrowByOrderId(orderId);
	if (!escrow) {
		throw new Error(`ESCROW_NOT_FOUND: order_id=${orderId}`);
	}

	const shippedAt = Date.now();
	const gracePeriodEnd = shippedAt + getGracePeriodSeconds() * 1000;

	const escrowUtxo = { txHash: escrow.utxo_tx_hash, outputIndex: escrow.utxo_output_index };

	const envelope = await resolveSignAndSubmitWithBackendSigner(client =>
		client.markShipped({
			escrowUtxo,
			shippedAt,
			gracePeriodEnd,
		} as Parameters<typeof client.markShipped>[0]),
	);

	// Rebuild the new datum CBOR from the escrow row fields + new gracePeriodEnd
	const buyerPkh = Buffer.from(escrow.buyer_pkh, 'hex');
	const merchantPkh = Buffer.from(escrow.merchant_pkh, 'hex');
	const orderIdBytes = Buffer.from(escrow.order_id, 'utf8');
	const paidAt = Number(escrow.paid_at);
	const shipDeadline = Number(escrow.ship_deadline);

	const newDatumCbor = buildShippedDatumCbor(buyerPkh, merchantPkh, orderIdBytes, paidAt, shipDeadline, gracePeriodEnd);

	// The new script output is always at index 0 per the tx3 TIR spec
	return {
		txHash: envelope.hash,
		newUtxoRef: { txHash: envelope.hash, outputIndex: 0 },
		newDatumCbor,
	};
}

/**
 * Builds and submits the `release_escrow` transaction.
 *
 * 1. Read current escrow row.
 * 2. Build releaseEscrow tx with escrowUtxo.
 * 3. Sign with backend merchant signer.
 * 4. Submit.
 * 5. Return { txHash }.
 */
export async function submitReleaseEscrow(orderId: string): Promise<{ txHash: string }> {
	const escrow = await getEscrowByOrderId(orderId);
	if (!escrow) {
		throw new Error(`ESCROW_NOT_FOUND: order_id=${orderId}`);
	}

	const escrowUtxo = { txHash: escrow.utxo_tx_hash, outputIndex: escrow.utxo_output_index };

	const envelope = await resolveSignAndSubmitWithBackendSigner(client =>
		client.releaseEscrow({
			escrowUtxo,
		} as Parameters<typeof client.releaseEscrow>[0]),
	);

	return { txHash: envelope.hash };
}

/**
 * Builds and submits the `refund_escrow` transaction.
 *
 * 1. Read current escrow row.
 * 2. Build refundEscrow tx with escrowUtxo.
 * 3. Sign the tx body hash with the buyer signer (hash-based, no CBOR round-trip).
 * 4. Submit.
 * 5. Return { txHash }.
 *
 * Uses `BuyerSigner.signTxBodyHash(envelope.hash)` so the buyer signs the
 * pre-computed tx body hash directly — avoiding CBOR decode+re-encode which
 * may not produce byte-identical bytes and would result in an invalid signature.
 */
export async function submitRefundEscrow(orderId: string, buyerSigner: BuyerSigner): Promise<{ txHash: string }> {
	const escrow = await getEscrowByOrderId(orderId);
	if (!escrow) {
		throw new Error(`ESCROW_NOT_FOUND: order_id=${orderId}`);
	}

	const { trpEndpoint, trpApiKey, profile } = getNetworkConfig();
	const clientOptions = trpApiKey
		? { endpoint: trpEndpoint, headers: { 'dmtr-api-key': trpApiKey } }
		: { endpoint: trpEndpoint };
	const client = new Client(clientOptions, profile as ProfileName);

	const escrowUtxo = { txHash: escrow.utxo_tx_hash, outputIndex: escrow.utxo_output_index };

	const envelope = await client.refundEscrow({
		escrowUtxo,
	} as Parameters<typeof client.refundEscrow>[0]);

	// Sign the pre-computed tx body hash directly — no CBOR decode/re-encode.
	// The chain verifies against the original tx body bytes hash (envelope.hash),
	// so we must sign that exact value.
	const { vkey, signature } = await buyerSigner.signTxBodyHash(envelope.hash);

	// Build the TxWitness array from the hex-encoded vkey and signature
	const witnesses: TxWitness[] = [
		{
			type: 'vkey',
			key: { content: vkey, contentType: 'hex' },
			signature: { content: signature, contentType: 'hex' },
		},
	];

	await client.submit({
		tx: { content: envelope.tx, contentType: 'hex' },
		witnesses,
	} satisfies Parameters<typeof client.submit>[0]);

	return { txHash: envelope.hash };
}
