/**
 * Traceability orchestrator.
 *
 * Builds and submits on-chain event transactions that record key order-lifecycle
 * milestones as Cardano tx metadata. The backend signer acts as the fee payer
 * and the tx is self-funded (merchant → merchant with metadata attached).
 *
 * Metadata layout — one entry per logical field, each ≤ 64 bytes:
 *   1337: event    — "paid" | "shipped" | "completed" | "cancelled" (UTF-8 bytes)
 *   1338: order_id — UUID string (UTF-8 bytes, 36 chars)
 *   1339: ts       — Unix seconds (Int)
 *   1340: extra    — event-specific freeform UTF-8 (tracking, reason, or empty)
 *
 * Split across distinct integer labels because the Cardano metadata spec caps
 * any single Bytes/Text leaf at 64 bytes. Once tx3 supports Map/Array values
 * in metadata (see ISSUE_tx3_metadata_structured_values.md) this collapses to
 * a single CIP-25-style record under label 1337.
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

export type TraceEvent = 'paid' | 'shipped' | 'completed' | 'cancelled';

// ---------------------------------------------------------------------------
// Internal event description (4 fields → 4 metadata entries)
// ---------------------------------------------------------------------------

interface EventArgs {
	event: TraceEvent;
	orderId: string;
	extra: string; // freeform UTF-8; empty string when no extra payload
}

// ---------------------------------------------------------------------------
// Private shared pipeline
// ---------------------------------------------------------------------------

const utf8Hex = (s: string): string => Buffer.from(s, 'utf8').toString('hex');

/**
 * Shared pipeline for all traceability events:
 * 1. Read network config (trpEndpoint, profile, merchantAddress).
 * 2. Hex-encode each field separately (tx3 Bytes args expect a hex string).
 * 3. Resolve the `record_order_event` tx via the codegen Client.
 * 4. Sign the resolved tx hash with the backend Ed25519 signer.
 * 5. Submit the signed tx to the TRP.
 * 6. Return { txHash, confirmed: false } — reconciliation is handled by A12.
 */
async function submitEvent({ event, orderId, extra }: EventArgs): Promise<TraceResult> {
	const { trpEndpoint, trpApiKey, profile, merchantAddress } = getNetworkConfig();

	const clientOptions = trpApiKey
		? { endpoint: trpEndpoint, headers: { 'dmtr-api-key': trpApiKey } }
		: { endpoint: trpEndpoint };
	const client = new Client(clientOptions, profile as ProfileName, {
		merchant: merchantAddress,
	});

	// Resolve the record_order_event tx. TRP expects the original .tx3 parameter
	// names (snake_case) — the camelCase types from codegen do not match the wire.
	const envelope: TxEnvelope = await client.recordOrderEvent({
		event: utf8Hex(event),
		order_id: utf8Hex(orderId),
		ts: Math.floor(Date.now() / 1000),
		extra: utf8Hex(extra),
	} as unknown as Parameters<typeof client.recordOrderEvent>[0]);

	const witnesses = getMerchantSigner().sign(envelope.hash);

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

	return submitEvent({ event: 'paid', orderId, extra: '' });
}

/**
 * Submits a `shipped` traceability event for the given order.
 * Optionally includes a tracking number under the `extra` metadata label.
 */
export async function submitShippedTrace(orderId: string, opts?: { trackingNumber?: string }): Promise<TraceResult> {
	return submitEvent({
		event: 'shipped',
		orderId,
		extra: opts?.trackingNumber ?? '',
	});
}

/**
 * Submits a `completed` traceability event for the given order.
 */
export async function submitCompletedTrace(orderId: string): Promise<TraceResult> {
	return submitEvent({ event: 'completed', orderId, extra: '' });
}

/**
 * Submits a `cancelled` traceability event for the given order.
 * The cancellation reason is required and is written to the `extra` label.
 */
export async function submitCancelledTrace(orderId: string, opts: { reason: string }): Promise<TraceResult> {
	return submitEvent({ event: 'cancelled', orderId, extra: opts.reason });
}
