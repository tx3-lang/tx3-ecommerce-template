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

import { getNetworkConfig } from './network.js';
import { getMerchantSigner } from './signer.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PaidTraceResult {
	txHash: string;
	confirmed: boolean;
}

// ---------------------------------------------------------------------------
// Internal payload type
// ---------------------------------------------------------------------------

interface TracePayload {
	v: 1;
	event: 'paid';
	order_id: string;
	merchant: string;
	ts: number;
	data: Record<string, never>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Submits a `paid` traceability event for the given order.
 *
 * Pipeline:
 * 1. Read network config (trpEndpoint, profile, merchantAddress).
 * 2. Build the metadata payload per the spec schema.
 * 3. Hex-encode the JSON-serialised payload (tx3 Bytes args are hex strings).
 * 4. Resolve the `record_order_event` tx via the codegen Client, injecting
 *    the merchant party via an args cast (PROFILES[profile].parties is {}).
 * 5. Sign the resolved tx hash with the backend Ed25519 signer.
 * 6. Submit the signed tx to the TRP.
 * 7. Return { txHash, confirmed: false } — reconciliation is handled by A12.
 */
export async function submitPaidTrace(orderId: string): Promise<PaidTraceResult> {
	const { trpEndpoint, profile, merchantAddress } = getNetworkConfig();

	// Build payload
	const payload: TracePayload = {
		v: 1,
		event: 'paid',
		order_id: orderId,
		merchant: merchantAddress,
		ts: Math.floor(Date.now() / 1000),
		data: {} as Record<string, never>,
	};

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
