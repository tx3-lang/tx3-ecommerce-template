/**
 * CLI script: cancel-order
 *
 * Usage:
 *   pnpm tsx scripts/cancel-order.ts --order-id <uuid> --reason <string>
 *
 * What it does:
 *   1. Reads the order from DB and validates current status is one of
 *      {pending, payment_failed, paid, processing, shipped}.
 *   2. Calls submitCancelledTrace(orderId, { reason }) to put the event on chain.
 *   3. On success: updates orders.status to "cancelled" + inserts order_events row.
 *   4. On chain failure: exits non-zero without touching the DB.
 *   5. Prints the tx hash and a CardanoScan explorer link (preview only) to stdout.
 *
 * NOT allowed from: "completed" (already fulfilled) or "cancelled" (already cancelled).
 *
 * Operation order (atomicity trade-off per Decision Log A9):
 *   submitCancelledTrace → UPDATE orders.status='cancelled' → insertOrderEvent
 *   A chain failure before the DB writes leaves the DB clean.
 */

import { parseArgs } from 'node:util';

import { submitCancelledTrace } from '@/lib/cardano/traceability';

import { runTransition } from './lib/transition.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CancelOrderResult {
	txHash: string;
	explorerUrl?: string;
}

// ---------------------------------------------------------------------------
// Allowed source statuses for cancellation
// ---------------------------------------------------------------------------

const CANCELLABLE_STATUSES = [
	'pending',
	'payment_failed',
	'paid',
	'processing',
	'shipped',
] as const satisfies readonly Database.OrderStatus[];

// ---------------------------------------------------------------------------
// main — exported for testability; entry point calls main(process.argv.slice(2))
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CancelOrderResult> {
	// -----------------------------------------------------------------------
	// Step 0: Parse CLI args
	// -----------------------------------------------------------------------
	const { values } = parseArgs({
		args,
		options: {
			'order-id': { type: 'string' },
			reason: { type: 'string' },
		},
		strict: true,
	});

	const orderId = values['order-id'];
	const reason = values['reason'];

	if (!orderId) {
		throw new Error('MISSING_ARG: --order-id is required');
	}

	if (!reason) {
		throw new Error('MISSING_ARG: --reason is required');
	}

	// -----------------------------------------------------------------------
	// Delegate to shared transition helper
	// -----------------------------------------------------------------------
	return runTransition({
		orderId,
		fromStatuses: CANCELLABLE_STATUSES,
		toStatus: 'cancelled',
		submitTrace: () => submitCancelledTrace(orderId, { reason }),
		eventType: 'cancelled',
		payloadData: { reason },
		scriptName: 'cancel-order',
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
		console.log(`[cancel-order] order=${orderId} tx=${result.txHash}`);
		if (result.explorerUrl) {
			// biome-ignore lint/suspicious/noConsole: intentional CLI output
			console.log(`Explorer: ${result.explorerUrl}`);
		}
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[cancel-order] ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

// Detect direct execution (tsx runs the file directly, not via import)
const isDirectRun =
	process.argv[1]?.endsWith('cancel-order.ts') || process.argv[1]?.endsWith('cancel-order.js');

if (isDirectRun) {
	void run();
}
