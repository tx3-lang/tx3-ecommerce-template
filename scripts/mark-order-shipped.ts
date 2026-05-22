/**
 * CLI script: mark-order-shipped
 *
 * Usage:
 *   pnpm tsx scripts/mark-order-shipped.ts --order-id <uuid> [--tracking <code>]
 *
 * What it does:
 *   1. Reads the order from DB and validates current status is "paid".
 *   2. Calls submitShippedTrace(orderId, { trackingNumber }) to put the event on chain.
 *   3. On success: updates orders.status to "shipped" + inserts order_events row.
 *   4. On chain failure: exits non-zero without touching the DB.
 *   5. Prints the tx hash and a CardanoScan explorer link (preview only) to stdout.
 *
 * Operation order (atomicity trade-off per Decision Log A9):
 *   submitShippedTrace → UPDATE orders.status='shipped' → insertOrderEvent
 *   A chain failure before step 2 leaves the DB clean.
 */

import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import { getNetworkConfig } from '@/lib/cardano/network';
import { submitShippedTrace } from '@/lib/cardano/traceability';
import { insertOrderEvent } from '@/server-fns/order-events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarkShippedResult {
	txHash: string;
	explorerUrl?: string;
}

// ---------------------------------------------------------------------------
// Service-role Supabase client (same pattern as src/server-fns/orders.ts)
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
// Explorer URL helper
// ---------------------------------------------------------------------------

function buildExplorerUrl(profile: string, txHash: string): string | undefined {
	if (profile === 'preview') {
		return `https://preview.cexplorer.io/tx/${txHash}`;
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// main — exported for testability; entry point calls main(process.argv.slice(2))
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<MarkShippedResult> {
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
	// Step 1: Validate current order status is "paid"
	// -----------------------------------------------------------------------
	const supabase = getServerSupabase();

	const { data: orderRow, error: fetchError } = await supabase
		.from('orders')
		.select('status')
		.eq('id', orderId)
		.single();

	if (fetchError || !orderRow) {
		throw new Error(`ORDER_NOT_FOUND: order ${orderId} not found — ${fetchError?.message ?? 'no data returned'}`);
	}

	if (orderRow.status !== 'paid') {
		throw new Error(
			`INVALID_TRANSITION: order ${orderId} is in status "${orderRow.status}", expected "paid". Cannot mark as shipped.`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 2: Submit on-chain trace BEFORE touching the DB.
	//   A chain failure here prevents the status transition — DB stays clean.
	// -----------------------------------------------------------------------
	const traceResult = await submitShippedTrace(orderId, { trackingNumber });

	// -----------------------------------------------------------------------
	// Step 3: Update orders.status to "shipped"
	// -----------------------------------------------------------------------
	const { error: updateError } = await supabase.from('orders').update({ status: 'shipped' }).eq('id', orderId);

	if (updateError) {
		throw new Error(`DB_UPDATE_FAILED: failed to update order status — ${updateError.message}`);
	}

	// -----------------------------------------------------------------------
	// Step 4: Insert order_events row
	//   If this fails, the order IS already marked shipped but the event row
	//   is missing — the reconciler (A12) can re-discover from the chain.
	// -----------------------------------------------------------------------
	await insertOrderEvent({
		order_id: orderId,
		event_type: 'shipped',
		tx_hash: traceResult.txHash,
		payload: { event: 'shipped', tx_hash: traceResult.txHash },
	});

	// -----------------------------------------------------------------------
	// Step 5: Build and return result
	// -----------------------------------------------------------------------
	const { profile } = getNetworkConfig();
	const explorerUrl = buildExplorerUrl(profile, traceResult.txHash);

	return { txHash: traceResult.txHash, explorerUrl };
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
		console.log(`[mark-shipped] order=${orderId} tx=${result.txHash}`);
		if (result.explorerUrl) {
			// biome-ignore lint/suspicious/noConsole: intentional CLI output
			console.log(`Explorer: ${result.explorerUrl}`);
		}
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[mark-shipped] ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

// Detect direct execution (tsx runs the file directly, not via import)
// We check for the script name in argv to avoid running in test/import context.
const isDirectRun = process.argv[1]?.endsWith('mark-order-shipped.ts') || process.argv[1]?.endsWith('mark-order-shipped.js');

if (isDirectRun) {
	void run();
}
