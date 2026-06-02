/**
 * CLI script: escrow-refund
 *
 * Usage:
 *   # prepare-only — emit the UNSIGNED tx CBOR to sign + submit in your wallet
 *   # (e.g. Eternl); your private key never touches this script:
 *   pnpm tsx scripts/escrow-refund.ts --order-id <uuid> --buyer-address <bech32> --prepare
 *
 *   # all-in-one (signs with the provided buyer key — demo/testing only):
 *   pnpm tsx scripts/escrow-refund.ts --order-id <uuid> --buyer-key <hex> --buyer-address <bech32>
 *
 * Scope (Feature B — escrow state machine ONLY):
 *   This script owns the `escrows` table and the on-chain escrow UTxO. It does
 *   NOT write `orders.status` nor `order_events` — the `cancelled` traceability
 *   event and the order status flip belong to the traceability scripts
 *   (Feature A, e.g. cancel-order.ts). This keeps the two subsystems from
 *   double-writing the unique (order_id, event_type) row in order_events.
 *
 * What it does:
 *   1. Validates escrow state: status='pending' AND NOW() >= ship_deadline.
 *   2. Constructs a buyer signer from the --buyer-key hex private key (Ed25519).
 *   3. Calls submitRefundEscrow(orderId, buyerSigner) to submit the on-chain refund.
 *   4. On success: updates escrows (status='refunded', refund_tx_hash).
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
 *   submitRefundEscrow → UPDATE escrows
 *   A chain failure before the DB write leaves the DB in its prior state.
 */

import { parseArgs } from 'node:util';

import { ed25519 } from '@noble/curves/ed25519.js';
import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'buffer';

import { prepareRefundEscrowTx, submitRefundEscrow } from '@/lib/cardano/escrow';
import type { BuyerSigner } from '@/lib/cardano/escrow';
import { getNetworkConfig } from '@/lib/cardano/network';

import { buildExplorerUrl } from './lib/transition.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscrowRefundResult {
	/** Set in submit (all-in-one) mode — the submitted refund tx hash. */
	txHash?: string;
	explorerUrl?: string;
	/** Set in --prepare mode — the unsigned refund tx CBOR (hex) to sign in the buyer wallet. */
	unsignedTx?: string;
	/** Set in --prepare mode — the tx body hash. */
	txBodyHash?: string;
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
			'buyer-address': { type: 'string' },
			prepare: { type: 'boolean' },
		},
		strict: true,
	});

	const orderId = values['order-id'];
	const buyerKeyHex = values['buyer-key'];
	const buyerAddress = values['buyer-address'];
	const prepareOnly = values.prepare ?? false;

	if (!orderId) {
		throw new Error('MISSING_ARG: --order-id is required');
	}

	if (!buyerAddress) {
		throw new Error('MISSING_ARG: --buyer-address is required (bech32 address of the buyer wallet)');
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
	// Prepare mode: resolve the UNSIGNED refund tx and return its CBOR for the
	// buyer to sign + submit out-of-band (e.g. Eternl). No key, no DB write —
	// run reconcile-escrow once the refund confirms on-chain to sync the row.
	// -----------------------------------------------------------------------
	if (prepareOnly) {
		const { envelope } = await prepareRefundEscrowTx(orderId, buyerAddress);
		return { unsignedTx: envelope.tx, txBodyHash: envelope.hash };
	}

	// From here on: submit (all-in-one) mode — the buyer key is required.
	if (!buyerKeyHex) {
		throw new Error('MISSING_ARG: --buyer-key is required (hex-encoded Ed25519 private key for milestone-mode)');
	}

	// -----------------------------------------------------------------------
	// Step 3: Build buyer signer from the --buyer-key hex private key
	// -----------------------------------------------------------------------
	const buyerSigner = buildBuyerSigner(buyerKeyHex);

	// -----------------------------------------------------------------------
	// Step 4: Submit on-chain refund_escrow transaction BEFORE DB writes.
	//   A chain failure here prevents all DB changes.
	// -----------------------------------------------------------------------
	const result = await submitRefundEscrow(orderId, buyerSigner, buyerAddress);

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
	// Step 6: Build and return result
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

		if (result.unsignedTx) {
			// biome-ignore lint/suspicious/noConsole: intentional CLI output
			console.log(
				'Unsigned refund tx (CBOR hex) — sign + submit it with the buyer wallet (e.g. Eternl). No DB write happened; run reconcile-escrow after it confirms on-chain.',
			);
			// biome-ignore lint/suspicious/noConsole: intentional CLI output
			console.log(result.unsignedTx);
			// biome-ignore lint/suspicious/noConsole: intentional CLI output
			console.log(`tx body hash: ${result.txBodyHash}`);
			return;
		}

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
