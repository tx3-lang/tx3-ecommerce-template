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

import { submitShippedTrace } from '@/lib/cardano/traceability';

import { runTransition } from './lib/transition.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarkShippedResult {
	txHash: string;
	explorerUrl?: string;
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
	// Delegate to shared transition helper
	// -----------------------------------------------------------------------
	return runTransition({
		orderId,
		fromStatuses: ['paid'],
		toStatus: 'shipped',
		submitTrace: () => submitShippedTrace(orderId, { trackingNumber }),
		eventType: 'shipped',
		payloadData: undefined,
		scriptName: 'mark-order-shipped',
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
const isDirectRun =
	process.argv[1]?.endsWith('mark-order-shipped.ts') || process.argv[1]?.endsWith('mark-order-shipped.js');

if (isDirectRun) {
	void run();
}
