/**
 * CLI script: reconcile-events
 *
 * Usage:
 *   pnpm tsx scripts/reconcile-events.ts
 *   pnpm reconcile-events
 *
 * What it does:
 *   1. Queries order_events WHERE confirmed_at IS NULL.
 *   2. Batch-calls TRP checkStatus() with all pending tx hashes.
 *   3. For each row whose tx is "confirmed" or "finalized" on chain,
 *      calls markEventConfirmed(eventId).
 *   4. Prints a summary: "Reconciled: N confirmed, M still pending, E errors".
 *
 * Exit codes:
 *   0 — success (even if some events are still pending)
 *   1 — fatal error (chain unreachable, DB query failure)
 *
 * Safe to run multiple times — the confirmed_at IS NULL filter ensures
 * already-confirmed rows are never re-processed.
 */

import { createClient } from '@supabase/supabase-js';

import { createU5cClient } from '@/lib/cardano/u5c-client';
import { getNetworkConfig } from '@/lib/cardano/network';
import { markEventConfirmed } from '@/server-fns/order-events';

// ---------------------------------------------------------------------------
// Helpers
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

/** Stages that mean the tx has been durably confirmed on chain. */
const CONFIRMED_STAGES = new Set(['confirmed', 'finalized']);

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ReconcileResult {
	/** Number of events successfully marked confirmed. */
	confirmed: number;
	/** Number of events that are still not confirmed on chain. */
	stillPending: number;
	/** Number of events where markEventConfirmed threw. */
	errors: number;
}

// ---------------------------------------------------------------------------
// main — exported for testability
// ---------------------------------------------------------------------------

export async function main(): Promise<ReconcileResult> {
	const supabase = getServerSupabase();
	const config = getNetworkConfig();
	const chainClient = createU5cClient(config);

	// -------------------------------------------------------------------------
	// Step 1: Fetch all order_events rows with confirmed_at IS NULL
	// -------------------------------------------------------------------------
	const { data, error } = await supabase.from('order_events').select('*').is('confirmed_at', null);

	if (error) {
		throw new Error(error.message);
	}

	const pendingRows = (data ?? []) as Database.OrderEvent[];

	if (pendingRows.length === 0) {
		return { confirmed: 0, stillPending: 0, errors: 0 };
	}

	// -------------------------------------------------------------------------
	// Step 2: Batch-check all tx hashes in one call
	// -------------------------------------------------------------------------
	const hashes = pendingRows.map(row => row.tx_hash);
	const { statuses } = await chainClient.checkStatus(hashes);

	// -------------------------------------------------------------------------
	// Step 3: Loop through rows and mark confirmed ones
	// -------------------------------------------------------------------------
	let confirmed = 0;
	let stillPending = 0;
	let errors = 0;

	for (const row of pendingRows) {
		const status = statuses[row.tx_hash];
		const stage = status?.stage;

		if (stage && CONFIRMED_STAGES.has(stage)) {
			try {
				await markEventConfirmed(row.id);
				confirmed++;
			} catch (_err) {
				errors++;
			}
		} else {
			stillPending++;
		}
	}

	return { confirmed, stillPending, errors };
}

// ---------------------------------------------------------------------------
// CLI entry point — only runs when this file is executed directly
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noConsole: intentional CLI output
async function run() {
	try {
		const result = await main();

		// biome-ignore lint/suspicious/noConsole: intentional CLI output
		console.log(
			`[reconcile-events] Reconciled: ${result.confirmed} confirmed, ${result.stillPending} still pending, ${result.errors} errors`,
		);

		if (result.errors > 0) {
			process.exit(1);
		}
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[reconcile-events] ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

const isDirectRun =
	process.argv[1]?.endsWith('reconcile-events.ts') || process.argv[1]?.endsWith('reconcile-events.js');

if (isDirectRun) {
	void run();
}
