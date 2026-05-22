/**
 * Traceability orchestrator.
 *
 * Builds and submits on-chain event transactions that record key order-lifecycle
 * milestones as Cardano tx metadata. The backend signer acts as the fee payer
 * and the tx is self-funded (merchant → merchant with metadata attached).
 *
 * Relies on:
 *   - getNetworkConfig() — trpEndpoint, profile, merchantAddress
 *   - getMerchantSigner() — Ed25519 signing of the resolved tx hash
 *   - Client (codegen facade) — recordOrderEvent + submit
 */

import { Buffer } from 'buffer';

import type { TxEnvelope } from 'tx3-sdk/trp';
import type { ProfileName } from '@/lib/tx3/protocol';
import { Client } from '@/lib/tx3/protocol';

import { getEscrowByOrderId } from '@/server-fns/escrows';
import { getNetworkConfig } from './network.js';
import { getMerchantSigner } from './signer.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TraceResult {
	txHash: string;
	confirmed: boolean;
}

// ---------------------------------------------------------------------------
// Internal payload types
// ---------------------------------------------------------------------------

interface BasePayload {
	v: 1;
	order_id: string;
	merchant: string;
	ts: number;
}

interface PaidPayload extends BasePayload {
	event: 'paid';
	data: Record<string, never>;
}

interface ShippedPayloadNoTracking extends BasePayload {
	event: 'shipped';
	data: Record<string, never>;
}

interface ShippedPayloadWithTracking extends BasePayload {
	event: 'shipped';
	data: { tracking_number: string };
}

type ShippedPayload = ShippedPayloadNoTracking | ShippedPayloadWithTracking;

interface CompletedPayload extends BasePayload {
	event: 'completed';
	data: Record<string, never>;
}

interface CancelledPayload extends BasePayload {
	event: 'cancelled';
	data: { reason: string };
}

type TracePayload = PaidPayload | ShippedPayload | CompletedPayload | CancelledPayload;

// ---------------------------------------------------------------------------
// Private shared pipeline
// ---------------------------------------------------------------------------

/**
 * Shared pipeline for all traceability events:
 * 1. Read network config (trpEndpoint, profile, merchantAddress).
 * 2. Hex-encode the JSON-serialised payload (tx3 Bytes args are hex strings).
 * 3. Resolve the `record_order_event` tx via the codegen Client.
 * 4. Sign the resolved tx hash with the backend Ed25519 signer.
 * 5. Submit the signed tx to the TRP.
 * 6. Return { txHash, confirmed: false } — reconciliation is handled by A12.
 */
async function submitEvent(payload: TracePayload): Promise<TraceResult> {
	const { trpEndpoint, profile, merchantAddress } = getNetworkConfig();

	// Hex-encode the UTF-8 JSON payload (tx3 Bytes args expect a hex string)
	const metadataPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('hex');

	// Construct the protocol client with the active profile
	const client = new Client({ endpoint: trpEndpoint }, profile as ProfileName);

	// Resolve the record_order_event tx.
	// PROFILES[profile].parties is {} so merchant is not injected by the profile;
	// we inject it explicitly via an args cast (same pattern as cardano-payment.ts).
	const envelope: TxEnvelope = await client.recordOrderEvent({
		metadataPayload,
		merchant: merchantAddress,
	} as Parameters<typeof client.recordOrderEvent>[0]);

	// Sign the resolved tx hash with the backend signer
	const witnesses = getMerchantSigner().sign(envelope.hash);

	// Submit the signed tx (response not used; A12 handles confirmation polling)
	await client.submit({
		tx: { content: envelope.tx, contentType: 'hex' },
		witnesses,
	} satisfies Parameters<typeof client.submit>[0]);

	// A12 handles confirmation polling; return confirmed: false for now
	return { txHash: envelope.hash, confirmed: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Submits a `paid` traceability event for the given order.
 *
 * If an escrow row already exists for this order the lock tx already records
 * the payment on-chain, so we skip the metadata-only trace and return the
 * escrow's utxo_tx_hash directly (confirmed: true).
 *
 * If no escrow row exists we fall back to the original metadata-only path.
 */
export async function submitPaidTrace(orderId: string): Promise<TraceResult> {
	// Short-circuit: if an escrow lock tx was already submitted for this order,
	// return its tx hash instead of emitting a redundant metadata trace.
	const escrow = await getEscrowByOrderId(orderId);
	if (escrow !== null) {
		return { txHash: escrow.utxo_tx_hash, confirmed: true };
	}

	const { merchantAddress } = getNetworkConfig();

	const payload: PaidPayload = {
		v: 1,
		event: 'paid',
		order_id: orderId,
		merchant: merchantAddress,
		ts: Math.floor(Date.now() / 1000),
		data: {} as Record<string, never>,
	};

	return submitEvent(payload);
}

/**
 * Submits a `shipped` traceability event for the given order.
 * Optionally includes a tracking number in the payload data.
 */
export async function submitShippedTrace(orderId: string, opts?: { trackingNumber?: string }): Promise<TraceResult> {
	const { merchantAddress } = getNetworkConfig();

	const payload: ShippedPayload = opts?.trackingNumber
		? {
				v: 1,
				event: 'shipped',
				order_id: orderId,
				merchant: merchantAddress,
				ts: Math.floor(Date.now() / 1000),
				data: { tracking_number: opts.trackingNumber },
			}
		: {
				v: 1,
				event: 'shipped',
				order_id: orderId,
				merchant: merchantAddress,
				ts: Math.floor(Date.now() / 1000),
				data: {} as Record<string, never>,
			};

	return submitEvent(payload);
}

/**
 * Submits a `completed` traceability event for the given order.
 */
export async function submitCompletedTrace(orderId: string): Promise<TraceResult> {
	const { merchantAddress } = getNetworkConfig();

	const payload: CompletedPayload = {
		v: 1,
		event: 'completed',
		order_id: orderId,
		merchant: merchantAddress,
		ts: Math.floor(Date.now() / 1000),
		data: {} as Record<string, never>,
	};

	return submitEvent(payload);
}

/**
 * Submits a `cancelled` traceability event for the given order.
 * The cancellation reason is required.
 */
export async function submitCancelledTrace(orderId: string, opts: { reason: string }): Promise<TraceResult> {
	const { merchantAddress } = getNetworkConfig();

	const payload: CancelledPayload = {
		v: 1,
		event: 'cancelled',
		order_id: orderId,
		merchant: merchantAddress,
		ts: Math.floor(Date.now() / 1000),
		data: { reason: opts.reason },
	};

	return submitEvent(payload);
}
