/**
 * CLI script: escrow-release
 *
 * Usage:
 *   pnpm tsx scripts/escrow-release.ts --order-id <uuid>
 *
 * Scope (Feature B — escrow state machine ONLY):
 *   This script owns the `escrows` table and the on-chain escrow UTxO. It does
 *   NOT write `orders.status` nor `order_events` — the `completed` traceability
 *   event and the order status flip belong to the traceability scripts
 *   (Feature A, e.g. mark-order-completed.ts). This keeps the two subsystems
 *   from double-writing the unique (order_id, event_type) row in order_events.
 *
 * What it does:
 *   1. Validates escrow state: status='shipped' AND NOW() >= grace_period_end.
 *   2. Calls submitReleaseEscrow(orderId) to submit the on-chain state transition.
 *   3. On success: updates escrows (status='released', release_tx_hash).
 *   4. On chain failure: exits non-zero without touching the DB.
 *   5. Prints "Released! Tx: <hash> | Explorer: <url>" to stdout.
 *
 * Atomicity trade-off (per Decision Log A9):
 *   submitReleaseEscrow → UPDATE escrows
 *   A chain failure before the DB write leaves the DB in its prior state.
 */

import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import { submitReleaseEscrow } from '@/lib/cardano/escrow';
import { getNetworkConfig } from '@/lib/cardano/network';

import { buildExplorerUrl } from './lib/transition.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscrowReleaseResult {
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

export async function main(args: string[]): Promise<EscrowReleaseResult> {
	// -----------------------------------------------------------------------
	// Step 0: Parse CLI args
	// -----------------------------------------------------------------------
	const { values } = parseArgs({
		args,
		options: {
			'order-id': { type: 'string' },
		},
		strict: true,
	});

	const orderId = values['order-id'];

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
	if (escrow.status !== 'shipped') {
		throw new Error(
			`INVALID_STATE: escrow for order ${orderId} is in status "${escrow.status}", expected "shipped". Cannot release.`,
		);
	}

	if (!escrow.grace_period_end) {
		throw new Error(
			`INVALID_STATE: escrow for order ${orderId} has no grace_period_end set. Cannot release.`,
		);
	}

	const gracePeriodEndMs = new Date(escrow.grace_period_end).getTime();
	if (Date.now() < gracePeriodEndMs) {
		throw new Error(
			`GRACE_PERIOD_NOT_ELAPSED: escrow for order ${orderId} grace period has not elapsed yet (ends ${escrow.grace_period_end}). Cannot release.`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 3: Submit on-chain release_escrow transaction BEFORE DB writes.
	//   A chain failure here prevents all DB changes.
	// -----------------------------------------------------------------------
	const result = await submitReleaseEscrow(orderId);

	// -----------------------------------------------------------------------
	// Step 4: Update escrows row
	// -----------------------------------------------------------------------
	const { error: escrowUpdateError } = await supabase
		.from('escrows')
		.update({
			status: 'released',
			release_tx_hash: result.txHash,
		})
		.eq('order_id', orderId);

	if (escrowUpdateError) {
		throw new Error(
			`DB_UPDATE_FAILED: [escrow-release] failed to update escrow — ${escrowUpdateError.message}`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 5: Build and return result
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
		console.log(`Released! Tx: ${result.txHash}${result.explorerUrl ? ` | Explorer: ${result.explorerUrl}` : ''}`);
		// biome-ignore lint/suspicious/noConsole: intentional CLI output
		console.log(`[escrow-release] order=${orderId} tx=${result.txHash}`);
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[escrow-release] ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

// Detect direct execution (tsx runs the file directly, not via import)
const isDirectRun =
	process.argv[1]?.endsWith('escrow-release.ts') || process.argv[1]?.endsWith('escrow-release.js');

if (isDirectRun) {
	void run();
}
