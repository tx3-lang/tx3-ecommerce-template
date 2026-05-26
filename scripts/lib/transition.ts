/**
 * Shared transition helper for merchant-driven order lifecycle CLI scripts.
 *
 * Encapsulates the common pattern across mark-order-shipped, mark-order-completed,
 * and cancel-order:
 *   1. Connect to Supabase via service-role.
 *   2. Read current order status.
 *   3. Validate the current status is in the allowed `fromStatuses` set.
 *   4. Call the provided `submitTrace()` callback (chain submission).
 *   5. On success: UPDATE orders.status to `toStatus` + insertOrderEvent.
 *   6. On submitTrace failure: do not touch DB; re-throw.
 *
 * Operation order follows the atomicity trade-off documented in Decision Log A9:
 *   submitTrace → UPDATE orders.status → insertOrderEvent
 */

import { createClient } from '@supabase/supabase-js';

import type { TraceResult } from '@/lib/cardano/traceability';
import { getNetworkConfig } from '@/lib/cardano/network';
import { insertOrderEvent } from '@/server-fns/order-events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransitionParams {
	/** Order UUID to transition. */
	orderId: string;
	/** Allowed source statuses. Transition aborts with INVALID_TRANSITION if current status is not in this set. */
	fromStatuses: readonly Database.OrderStatus[];
	/** Target status to write to orders.status on success. */
	toStatus: Database.OrderStatus;
	/** Async callback that submits the on-chain trace. Called BEFORE any DB writes. */
	submitTrace: () => Promise<TraceResult>;
	/** event_type value for the order_events row. */
	eventType: Database.OrderEventType;
	/** Optional extra fields merged into the order_events payload. */
	payloadData?: Record<string, Database.JsonValue>;
	/** Script name used in log/error messages. */
	scriptName: string;
}

export interface TransitionResult {
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
// Explorer URL helper
// ---------------------------------------------------------------------------

export function buildExplorerUrl(profile: string, txHash: string): string | undefined {
	if (profile === 'preview') {
		return `https://preview.cexplorer.io/tx/${txHash}`;
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Main helper
// ---------------------------------------------------------------------------

export async function runTransition(params: TransitionParams): Promise<TransitionResult> {
	const { orderId, fromStatuses, toStatus, submitTrace, eventType, payloadData, scriptName } = params;

	// -------------------------------------------------------------------------
	// Step 1: Validate current order status
	// -------------------------------------------------------------------------
	const supabase = getServerSupabase();

	const { data: orderRow, error: fetchError } = await supabase
		.from('orders')
		.select('status')
		.eq('id', orderId)
		.single();

	if (fetchError || !orderRow) {
		throw new Error(
			`ORDER_NOT_FOUND: order ${orderId} not found — ${fetchError?.message ?? 'no data returned'}`,
		);
	}

	const currentStatus = orderRow.status as Database.OrderStatus;

	if (!fromStatuses.includes(currentStatus)) {
		const allowed = fromStatuses.join(', ');
		throw new Error(
			`INVALID_TRANSITION: order ${orderId} is in status "${currentStatus}", expected one of [${allowed}]. Cannot transition to "${toStatus}".`,
		);
	}

	// -------------------------------------------------------------------------
	// Step 2: Submit on-chain trace BEFORE touching the DB.
	//   A chain failure here prevents the status transition — DB stays clean.
	// -------------------------------------------------------------------------
	const traceResult = await submitTrace();

	// -------------------------------------------------------------------------
	// Step 3: Update orders.status
	// -------------------------------------------------------------------------
	const { error: updateError } = await supabase
		.from('orders')
		.update({ status: toStatus })
		.eq('id', orderId);

	if (updateError) {
		throw new Error(`DB_UPDATE_FAILED: [${scriptName}] failed to update order status — ${updateError.message}`);
	}

	// -------------------------------------------------------------------------
	// Step 4: Insert order_events row
	//   If this fails, the order IS already transitioned but the event row is
	//   missing — the reconciler (A12) can re-discover from the chain.
	// -------------------------------------------------------------------------
	const payload: Record<string, Database.JsonValue> = {
		event: eventType,
		tx_hash: traceResult.txHash,
		...payloadData,
	};

	await insertOrderEvent({
		order_id: orderId,
		event_type: eventType,
		tx_hash: traceResult.txHash,
		payload,
	});

	// -------------------------------------------------------------------------
	// Step 5: Build and return result
	// -------------------------------------------------------------------------
	const { profile } = getNetworkConfig();
	const explorerUrl = buildExplorerUrl(profile, traceResult.txHash);

	return { txHash: traceResult.txHash, explorerUrl };
}
