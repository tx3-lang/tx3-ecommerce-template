/**
 * CLI script: escrow-refund
 *
 * Usage:
 *   pnpm tsx scripts/escrow-refund.ts --order-id <uuid> --buyer-key <hex>
 *
 * What it does:
 *   1. Validates escrow state: status='pending' AND NOW() >= ship_deadline.
 *   2. Constructs a buyer signer from the --buyer-key hex private key (Ed25519).
 *   3. Calls submitRefundEscrow(orderId, buyerSigner) to submit the on-chain refund.
 *   4. On success: updates escrows (status='refunded', refund_tx_hash) +
 *      orders.status='cancelled' + inserts order_events row with
 *      event_type='cancelled' and data.reason='ship_deadline_exceeded'.
 *   5. On chain failure: exits non-zero without touching the DB.
 *   6. Prints "Refunded! Tx: <hash> | Explorer: <url>" to stdout.
 *
 * Buyer signer (test/demo):
 *   submitRefundEscrow expects a CIP-30 CardanoWalletAPI object which calls
 *   buyerSigner.signTx(txCbor, true) and returns a witness set CBOR hex.
 *   For the CLI, we wrap an Ed25519 private key into a minimal CardanoWalletAPI
 *   stub — the same approach used by getMerchantSigner() for the backend signer,
 *   but packaged into the CIP-30 signTx interface shape.
 *
 *   This is acceptable for milestone demo/testing. Production refunds should
 *   be triggered via the buyer's browser wallet (CIP-30).
 *
 * Atomicity trade-off (per Decision Log A9):
 *   submitRefundEscrow → UPDATE escrows → UPDATE orders → insertOrderEvent
 *   A chain failure before the DB writes leaves the DB in its prior state.
 */

import { parseArgs } from 'node:util';

import { ed25519 } from '@noble/curves/ed25519.js';
import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'buffer';

import { submitRefundEscrow } from '@/lib/cardano/escrow';
import type { BuyerSigner } from '@/lib/cardano/escrow';
import { getNetworkConfig } from '@/lib/cardano/network';
import { insertOrderEvent } from '@/server-fns/order-events';

import { buildExplorerUrl } from './lib/transition.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscrowRefundResult {
	txHash: string;
	explorerUrl?: string;
}

// ---------------------------------------------------------------------------
// Service-role Supabase client
// ---------------------------------------------------------------------------

function getServerSupabase() {
	const supabaseUrl = process.env.VITE_SUPABASE_URL;
	const secretKey = process.env.SUPABASE_SECRET_KEY;

	if (!supabaseUrl || !secretKey) {
		throw new Error('MISSING_ENV: VITE_SUPABASE_URL and SUPABASE_SECRET_KEY are required');
	}

	return createClient(supabaseUrl, secretKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

// ---------------------------------------------------------------------------
// Buyer signer factory
//
// Creates a BuyerSigner from a hex-encoded Ed25519 private key.
// signTxBodyHash() receives the pre-computed tx body hash (hex) from the
// tx3-sdk envelope and signs it directly with Ed25519.
//
// This avoids the CBOR round-trip bug in the previous implementation, where
// the full tx CBOR was decoded and the tx body re-encoded before hashing.
// CBOR decode+re-encode is not guaranteed to produce byte-identical bytes
// (map key ordering, integer encoding), so the re-encoded hash may differ from
// the original tx body hash that the chain verifies against.
//
// By signing envelope.hash directly, we guarantee the signature matches what
// the chain will verify.
//
// This is the test/demo signer — production refunds should use the buyer's
// browser wallet via a CIP-30 adapter.
// ---------------------------------------------------------------------------

function buildBuyerSigner(buyerKeyHex: string): BuyerSigner {
	if (!/^[0-9a-fA-F]{64}$/.test(buyerKeyHex)) {
		throw new Error('INVALID_ARG: --buyer-key must be 64 hex chars (32-byte Ed25519 private key)');
	}

	const privateKeyBytes = Buffer.from(buyerKeyHex, 'hex');
	const publicKeyBytes = Buffer.from(ed25519.getPublicKey(privateKeyBytes));

	return {
		signTxBodyHash: async (txBodyHash: string): Promise<{ vkey: string; signature: string }> => {
			// Sign the tx body hash directly — no CBOR decode/re-encode needed.
			// envelope.hash is already the blake2b-256 hash of the original tx body bytes.
			const txHashBytes = Buffer.from(txBodyHash, 'hex');
			const signatureBytes = Buffer.from(ed25519.sign(txHashBytes, privateKeyBytes));

			return {
				vkey: publicKeyBytes.toString('hex'),
				signature: signatureBytes.toString('hex'),
			};
		},
	};
}

// ---------------------------------------------------------------------------
// main — exported for testability; entry point calls main(process.argv.slice(2))
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<EscrowRefundResult> {
	// -----------------------------------------------------------------------
	// Step 0: Parse CLI args
	// -----------------------------------------------------------------------
	const { values } = parseArgs({
		args,
		options: {
			'order-id': { type: 'string' },
			'buyer-key': { type: 'string' },
		},
		strict: true,
	});

	const orderId = values['order-id'];
	const buyerKeyHex = values['buyer-key'];

	if (!orderId) {
		throw new Error('MISSING_ARG: --order-id is required');
	}

	if (!buyerKeyHex) {
		throw new Error('MISSING_ARG: --buyer-key is required (hex-encoded Ed25519 private key for milestone-mode)');
	}

	// -----------------------------------------------------------------------
	// Step 1: Read escrow row (optimistic lock — see module docblock)
	// -----------------------------------------------------------------------
	const supabase = getServerSupabase();

	const { data: escrowRow, error: fetchError } = await supabase
		.from('escrows')
		.select('*')
		.eq('order_id', orderId)
		.single();

	if (fetchError || !escrowRow) {
		throw new Error(
			`ESCROW_NOT_FOUND: escrow for order ${orderId} not found — ${fetchError?.message ?? 'no data returned'}`,
		);
	}

	const escrow = escrowRow as Database.Escrow;

	// -----------------------------------------------------------------------
	// Step 2: Validate escrow state
	// -----------------------------------------------------------------------
	if (escrow.status !== 'pending') {
		throw new Error(
			`INVALID_STATE: escrow for order ${orderId} is in status "${escrow.status}", expected "pending". Cannot refund.`,
		);
	}

	const shipDeadlineMs = new Date(escrow.ship_deadline).getTime();
	if (Date.now() < shipDeadlineMs) {
		throw new Error(
			`SHIP_DEADLINE_NOT_REACHED: escrow for order ${orderId} ship deadline has not passed yet (${escrow.ship_deadline}). Cannot refund.`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 3: Build buyer signer from the --buyer-key hex private key
	// -----------------------------------------------------------------------
	const buyerSigner = buildBuyerSigner(buyerKeyHex);

	// -----------------------------------------------------------------------
	// Step 4: Submit on-chain refund_escrow transaction BEFORE DB writes.
	//   A chain failure here prevents all DB changes.
	// -----------------------------------------------------------------------
	const result = await submitRefundEscrow(orderId, buyerSigner);

	// -----------------------------------------------------------------------
	// Step 5: Update escrows row
	// -----------------------------------------------------------------------
	const { error: escrowUpdateError } = await supabase
		.from('escrows')
		.update({
			status: 'refunded',
			refund_tx_hash: result.txHash,
		})
		.eq('order_id', orderId);

	if (escrowUpdateError) {
		throw new Error(
			`DB_UPDATE_FAILED: [escrow-refund] failed to update escrow — ${escrowUpdateError.message}`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 6: Update orders.status = 'cancelled'
	// -----------------------------------------------------------------------
	const { error: orderUpdateError } = await supabase
		.from('orders')
		.update({ status: 'cancelled' })
		.eq('id', orderId);

	if (orderUpdateError) {
		throw new Error(
			`DB_UPDATE_FAILED: [escrow-refund] failed to update order status — ${orderUpdateError.message}`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 7: Insert order_events row
	//   If this fails, the order IS already transitioned but the event row is
	//   missing — the reconciler can re-discover from the chain.
	// -----------------------------------------------------------------------
	await insertOrderEvent({
		order_id: orderId,
		event_type: 'cancelled',
		tx_hash: result.txHash,
		payload: {
			event: 'cancelled',
			tx_hash: result.txHash,
			reason: 'ship_deadline_exceeded',
		},
	});

	// -----------------------------------------------------------------------
	// Step 8: Build and return result
	// -----------------------------------------------------------------------
	const { profile } = getNetworkConfig();
	const explorerUrl = buildExplorerUrl(profile, result.txHash);

	return { txHash: result.txHash, explorerUrl };
}

// ---------------------------------------------------------------------------
// CLI entry point — only runs when this file is executed directly
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noConsole: intentional CLI output
async function run() {
	try {
		const result = await main(process.argv.slice(2));

		const orderId = process.argv.find((_, i) => process.argv[i - 1] === '--order-id') ?? 'unknown';
		// biome-ignore lint/suspicious/noConsole: intentional CLI output
		console.log(`Refunded! Tx: ${result.txHash}${result.explorerUrl ? ` | Explorer: ${result.explorerUrl}` : ''}`);
		// biome-ignore lint/suspicious/noConsole: intentional CLI output
		console.log(`[escrow-refund] order=${orderId} tx=${result.txHash}`);
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[escrow-refund] ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

// Detect direct execution (tsx runs the file directly, not via import)
const isDirectRun =
	process.argv[1]?.endsWith('escrow-refund.ts') || process.argv[1]?.endsWith('escrow-refund.js');

if (isDirectRun) {
	void run();
}
