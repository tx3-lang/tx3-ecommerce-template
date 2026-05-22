/**
 * CLI script: mark-order-completed
 *
 * Usage:
 *   pnpm tsx scripts/mark-order-completed.ts --order-id <uuid>
 *
 * What it does:
 *   1. Reads the order from DB and validates current status is "shipped".
 *   2. Calls submitCompletedTrace(orderId) to put the event on chain.
 *   3. On success: updates orders.status to "completed" + inserts order_events row.
 *   4. On chain failure: exits non-zero without touching the DB.
 *   5. Prints the tx hash and a CardanoScan explorer link (preview only) to stdout.
 *
 * Allowed transition: shipped → completed ONLY.
 *   Skipping shipping (paid → completed) is NOT permitted by this script.
 *   Rationale: the spec lists "completed" as closure of the happy path after shipping.
 *   The reconciler (A12) handles auto-complete after grace period independently.
 *
 * Operation order (atomicity trade-off per Decision Log A9):
 *   submitCompletedTrace → UPDATE orders.status='completed' → insertOrderEvent
 *   A chain failure before the DB writes leaves the DB clean.
 */

import { parseArgs } from 'node:util';

import { submitCompletedTrace } from '@/lib/cardano/traceability';

import { runTransition } from './lib/transition.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarkCompletedResult {
	txHash: string;
	explorerUrl?: string;
}

// ---------------------------------------------------------------------------
// main — exported for testability; entry point calls main(process.argv.slice(2))
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<MarkCompletedResult> {
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
	// Delegate to shared transition helper
	// -----------------------------------------------------------------------
	return runTransition({
		orderId,
		fromStatuses: ['shipped'],
		toStatus: 'completed',
		submitTrace: () => submitCompletedTrace(orderId),
		eventType: 'completed',
		scriptName: 'mark-order-completed',
	});
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
		console.log(`[mark-completed] order=${orderId} tx=${result.txHash}`);
		if (result.explorerUrl) {
			// biome-ignore lint/suspicious/noConsole: intentional CLI output
			console.log(`Explorer: ${result.explorerUrl}`);
		}
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[mark-completed] ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

// Detect direct execution (tsx runs the file directly, not via import)
const isDirectRun =
	process.argv[1]?.endsWith('mark-order-completed.ts') || process.argv[1]?.endsWith('mark-order-completed.js');

if (isDirectRun) {
	void run();
}
