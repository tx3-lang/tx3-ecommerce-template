/**
 * CLI script: register-tracking
 *
 * Usage:
 *   pnpm register-tracking --order-id <uuid> --carrier <name> --tracking <number>
 *
 * Scope (oracle settlement — orders table ONLY):
 *   Sets the shipment-tracking fields (carrier, tracking_number) on the orders
 *   row so the oracle keeper (Task 5) can resolve the delivery status and
 *   trigger on-chain escrow settlement. This script does NOT touch:
 *     - orders.status              (owned by traceability scripts, Feature A)
 *     - order_events               (owned by traceability scripts, Feature A)
 *     - escrows                    (owned by escrow scripts, Feature B)
 *
 * Null / absent tracking_number means "no oracle tracking" — the keeper will
 * skip the order and fall back to the manual release flow.
 */

import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import { setOrderTracking } from '@/server-fns/orders';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisterTrackingResult {
	orderId: string;
	carrier: string;
	trackingNumber: string;
}

// ---------------------------------------------------------------------------
// Service-role Supabase client (local — mirrors escrow-mark-shipped pattern)
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

export async function main(args: string[]): Promise<RegisterTrackingResult> {
	// -----------------------------------------------------------------------
	// Step 0: Parse CLI args
	// -----------------------------------------------------------------------
	const { values } = parseArgs({
		args,
		options: {
			'order-id': { type: 'string' },
			carrier: { type: 'string' },
			tracking: { type: 'string' },
		},
		strict: true,
	});

	const orderId = values['order-id'];
	const carrier = values['carrier'];
	const tracking = values['tracking'];

	if (!orderId) {
		throw new Error('MISSING_ARG: --order-id is required');
	}
	if (!carrier) {
		throw new Error('MISSING_ARG: --carrier is required');
	}
	if (!tracking) {
		throw new Error('MISSING_ARG: --tracking is required');
	}

	// -----------------------------------------------------------------------
	// Step 1: Confirm the order exists
	// -----------------------------------------------------------------------
	const supabase = getServerSupabase();

	const { data: orderRow, error: fetchError } = await supabase
		.from('orders')
		.select('id')
		.eq('id', orderId)
		.single();

	if (fetchError || !orderRow) {
		throw new Error(
			`ORDER_NOT_FOUND: order ${orderId} not found — ${fetchError?.message ?? 'no data returned'}`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 2: Write carrier + tracking_number (no status / event writes)
	// -----------------------------------------------------------------------
	await setOrderTracking(orderId, carrier, tracking);

	return { orderId, carrier, trackingNumber: tracking };
}

// ---------------------------------------------------------------------------
// CLI entry point — only runs when this file is executed directly
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noConsole: intentional CLI output
async function run() {
	try {
		const result = await main(process.argv.slice(2));
		// biome-ignore lint/suspicious/noConsole: intentional CLI output
		console.log(
			`Tracking registered! order=${result.orderId} carrier=${result.carrier} tracking=${result.trackingNumber}`,
		);
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[register-tracking] ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

// Detect direct execution (tsx runs the file directly, not via import)
const isDirectRun =
	process.argv[1]?.endsWith('register-tracking.ts') || process.argv[1]?.endsWith('register-tracking.js');

if (isDirectRun) {
	void run();
}
