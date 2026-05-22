/**
 * CLI script: escrow-mark-shipped
 *
 * Usage:
 *   pnpm tsx scripts/escrow-mark-shipped.ts --order-id <uuid> [--tracking <code>]
 *
 * What it does:
 *   1. Validates escrow state: status='pending' AND NOW() < ship_deadline.
 *   2. Calls submitMarkShipped(orderId) to submit the on-chain state transition.
 *   3. On success: updates escrows (status, utxo refs, grace_period_end,
 *      shipped_tx_hash, datum_cbor) + orders.status='shipped' + inserts
 *      order_events row with event_type='shipped'.
 *   4. On chain failure: exits non-zero without touching the DB.
 *   5. Prints "Shipped! Tx: <hash> | Explorer: <url>" to stdout.
 *
 * Atomicity trade-off (per Decision Log A9):
 *   submitMarkShipped → UPDATE escrows → UPDATE orders → insertOrderEvent
 *   A chain failure before the DB writes leaves the DB in its prior state.
 *
 * SELECT FOR UPDATE note:
 *   Supabase JS has no native transaction/FOR UPDATE API. This script uses
 *   an optimistic select + validate + update pattern. The state check runs
 *   immediately before the chain call to minimise the race window.
 */

import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import { submitMarkShipped } from '@/lib/cardano/escrow';
import { getGracePeriodSeconds } from '@/lib/cardano/escrow-policy';
import { getNetworkConfig } from '@/lib/cardano/network';
import { insertOrderEvent } from '@/server-fns/order-events';

import { buildExplorerUrl } from './lib/transition.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscrowMarkShippedResult {
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
// main — exported for testability; entry point calls main(process.argv.slice(2))
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<EscrowMarkShippedResult> {
	// -----------------------------------------------------------------------
	// Step 0: Parse CLI args
	// -----------------------------------------------------------------------
	const { values } = parseArgs({
		args,
		options: {
			'order-id': { type: 'string' },
			tracking: { type: 'string' },
		},
		strict: true,
	});

	const orderId = values['order-id'];
	const trackingNumber = values['tracking'];

	if (!orderId) {
		throw new Error('MISSING_ARG: --order-id is required');
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
			`INVALID_STATE: escrow for order ${orderId} is in status "${escrow.status}", expected "pending". Cannot mark as shipped.`,
		);
	}

	const shipDeadlineMs = new Date(escrow.ship_deadline).getTime();
	if (Date.now() >= shipDeadlineMs) {
		throw new Error(
			`SHIP_DEADLINE_EXCEEDED: escrow for order ${orderId} ship deadline has passed (${escrow.ship_deadline}). Cannot mark as shipped.`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 3: Submit on-chain mark_shipped transaction BEFORE DB writes.
	//   A chain failure here prevents all DB changes.
	// -----------------------------------------------------------------------
	const result = await submitMarkShipped(orderId);

	// -----------------------------------------------------------------------
	// Step 4: Compute grace_period_end
	//   submitMarkShipped does not expose gracePeriodEnd in its return type,
	//   so we approximate it here: shippedAt + getGracePeriodSeconds() * 1000.
	//   This closely matches the on-chain datum value (within ms of clock drift).
	// -----------------------------------------------------------------------
	const gracePeriodEndMs = Date.now() + getGracePeriodSeconds() * 1000;
	const gracePeriodEndIso = new Date(gracePeriodEndMs).toISOString();

	// -----------------------------------------------------------------------
	// Step 5: Update escrows row
	// -----------------------------------------------------------------------
	const { error: escrowUpdateError } = await supabase
		.from('escrows')
		.update({
			status: 'shipped',
			shipped_tx_hash: result.txHash,
			utxo_tx_hash: result.newUtxoRef.txHash,
			utxo_output_index: result.newUtxoRef.outputIndex,
			datum_cbor: result.newDatumCbor,
			grace_period_end: gracePeriodEndIso,
		})
		.eq('order_id', orderId);

	if (escrowUpdateError) {
		throw new Error(
			`DB_UPDATE_FAILED: [escrow-mark-shipped] failed to update escrow — ${escrowUpdateError.message}`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 6: Update orders.status = 'shipped'
	// -----------------------------------------------------------------------
	const { error: orderUpdateError } = await supabase
		.from('orders')
		.update({ status: 'shipped' })
		.eq('id', orderId);

	if (orderUpdateError) {
		throw new Error(
			`DB_UPDATE_FAILED: [escrow-mark-shipped] failed to update order status — ${orderUpdateError.message}`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 7: Insert order_events row
	//   If this fails, the order IS already transitioned but the event row is
	//   missing — the reconciler can re-discover from the chain.
	// -----------------------------------------------------------------------
	const payload: Record<string, Database.JsonValue> = {
		event: 'shipped',
		tx_hash: result.txHash,
	};

	if (trackingNumber) {
		payload.tracking_number = trackingNumber;
	}

	await insertOrderEvent({
		order_id: orderId,
		event_type: 'shipped',
		tx_hash: result.txHash,
		payload,
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
		console.log(`Shipped! Tx: ${result.txHash}${result.explorerUrl ? ` | Explorer: ${result.explorerUrl}` : ''}`);
		// biome-ignore lint/suspicious/noConsole: intentional CLI output
		console.log(`[escrow-mark-shipped] order=${orderId} tx=${result.txHash}`);
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[escrow-mark-shipped] ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

// Detect direct execution (tsx runs the file directly, not via import)
const isDirectRun =
	process.argv[1]?.endsWith('escrow-mark-shipped.ts') || process.argv[1]?.endsWith('escrow-mark-shipped.js');

if (isDirectRun) {
	void run();
}
