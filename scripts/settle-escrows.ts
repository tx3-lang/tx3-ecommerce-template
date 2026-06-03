/**
 * CLI script: settle-escrows
 *
 * Usage:
 *   pnpm tsx scripts/settle-escrows.ts [--dry-run] [--no-traceability]
 *   pnpm settle-escrows [--dry-run] [--no-traceability]
 *
 * What it does:
 *   Scans all escrows with status in {'pending','shipped'}, joins each to its
 *   order to retrieve (carrier, tracking_number), then for each escrow that has
 *   a registered tracking number:
 *     1. Calls the shipping oracle's prepareCommitment() to fetch + Ed25519-
 *        verify the attestation (throws on bad signature or response mismatch —
 *        the escrow is skipped and the error is logged).
 *     2. Passes the oracle status + escrow row to decideEscrowAction() to get a
 *        pure, testable decision.
 *     3. Delegates to the existing escrow transition scripts:
 *          'mark_shipped' → escrow-mark-shipped main(['--order-id', id])
 *          'release'       → escrow-release main(['--order-id', id])
 *          'none'          → no-op (logged)
 *     4. Traceability sync (default ON; disable with --no-traceability): after a
 *        successful escrow transition, also runs the matching traceability script
 *        (mark_shipped → mark-order-shipped with the tracking number;
 *        release → mark-order-completed) so orders.status + order_events stay in
 *        sync. Best-effort: a traceability failure is logged, never fails the escrow.
 *
 * Design properties:
 *   - Idempotent / optimistic: each delegated script re-validates escrow state
 *     and submits the chain tx BEFORE the DB write. Re-running after a partial
 *     run is safe — the delegated scripts enforce their own state guards.
 *   - Error isolation: one escrow failure does NOT abort the run. Each escrow
 *     is processed in its own try/catch; processing continues for the rest.
 *   - Refund is intentionally OUT OF SCOPE. The keeper logs escrows that are
 *     now refund-eligible (pending AND past ship_deadline) but NEVER submits a
 *     refund — that remains buyer-initiated.
 *   - --dry-run: logs each decision without submitting any chain transaction or
 *     making any DB write.
 *   - No-tracking fallback: escrows whose order has a NULL carrier or NULL
 *     tracking_number are skipped and logged; manual operator flow applies.
 *
 * Accepted env vars (same as the delegated transition scripts):
 *   VITE_SUPABASE_URL   — Supabase project URL
 *   SUPABASE_SECRET_KEY — Service-role secret key
 *   ORACLE_BASE_URL     — Shipping oracle HTTP base URL
 *   ORACLE_PUBLIC_KEY   — (optional) Ed25519 public key hex for attestation pinning
 */

import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import { getOracleClient } from '@/lib/oracle/client';
import { decideEscrowAction } from '@/lib/oracle/settlement';

import { main as markShippedMain } from './escrow-mark-shipped.js';
import { main as releaseMain } from './escrow-release.js';
import { main as markOrderCompletedMain } from './mark-order-completed.js';
import { main as markOrderShippedMain } from './mark-order-shipped.js';

import type { OracleClient } from 'shipping-oracle-sdk';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SettleOptions {
	/**
	 * Oracle client to use for attestation fetching + verification.
	 * Defaults to the factory `getOracleClient()`.
	 * Inject a stub here in e2e tests to control oracle responses without a
	 * live oracle server.
	 */
	oracleClient?: OracleClient;

	/**
	 * When true, logs decisions per escrow but does NOT submit any chain
	 * transaction or make any DB write.
	 */
	dryRun?: boolean;

	/**
	 * When true (default), after a successful escrow transition the keeper also
	 * runs the matching traceability script to keep orders.status + order_events
	 * in sync (mark_shipped → mark-order-shipped, release → mark-order-completed).
	 * A traceability failure is logged but never fails the escrow settlement.
	 */
	traceability?: boolean;
}

export interface SettleSummary {
	/** Total escrows scanned (status pending | shipped). */
	scanned: number;
	/** Escrows skipped because their order has no tracking number / carrier. */
	skippedNoTracking: number;
	/** Escrows successfully transitioned to 'shipped' via mark_shipped. */
	marked: number;
	/** Escrows successfully transitioned to 'released' via release. */
	released: number;
	/** Escrows for which the oracle returned a status that requires no action. */
	noop: number;
	/** Escrows that encountered an error and were skipped (oracle + chain + DB). */
	errors: number;
	/** Escrows logged as refund-eligible (pending + ship_deadline elapsed). */
	refundEligible: number;
	/** Successful traceability syncs (orders.status + order_events) after a transition. */
	traced: number;
	/** Traceability syncs that failed (the escrow transition still succeeded). */
	traceErrors: number;
}

// ---------------------------------------------------------------------------
// Service-role Supabase client (same pattern as escrow-mark-shipped / release)
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
// Shape of the Supabase embed row
// ---------------------------------------------------------------------------

interface EscrowWithOrder extends Database.Escrow {
	orders: {
		carrier: string | null;
		tracking_number: string | null;
	} | null;
}

// ---------------------------------------------------------------------------
// Traceability sync — best-effort. Keeps orders.status + order_events aligned
// with the escrow lifecycle by delegating to the traceability scripts. A
// failure here NEVER fails the escrow settlement (the escrow is the source of
// truth); it is logged so an operator can re-run the traceability script.
// ---------------------------------------------------------------------------

async function syncOrderTraceability(
	kind: 'shipped' | 'completed',
	orderId: string,
	trackingNumber: string,
): Promise<boolean> {
	try {
		if (kind === 'shipped') {
			await markOrderShippedMain(['--order-id', orderId, '--tracking', trackingNumber]);
		} else {
			await markOrderCompletedMain(['--order-id', orderId]);
		}
		// biome-ignore lint/suspicious/noConsole: intentional CLI output
		console.log(`[settle-escrows] order=${orderId} traceability synced → ${kind}`);
		return true;
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.warn(
			`[settle-escrows] order=${orderId} traceability sync (${kind}) failed — escrow is already settled; run mark-order-${kind} manually: ${err instanceof Error ? err.message : String(err)}`,
		);
		return false;
	}
}

// ---------------------------------------------------------------------------
// Core exported function — drives the settle loop
// ---------------------------------------------------------------------------

export async function settleEscrows(opts: SettleOptions = {}): Promise<SettleSummary> {
	const oracleClient = opts.oracleClient ?? getOracleClient();
	const dryRun = opts.dryRun ?? false;
	const traceability = opts.traceability ?? true;

	if (dryRun) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI output
		console.log('[settle-escrows] DRY RUN — no chain txs or DB writes will be performed');
	}

	// -------------------------------------------------------------------------
	// Step 1: Scan eligible escrows, joined to their order for tracking info
	// -------------------------------------------------------------------------
	const supabase = getServerSupabase();

	const { data: rows, error: scanError } = await supabase
		.from('escrows')
		.select('*, orders(carrier, tracking_number)')
		.in('status', ['pending', 'shipped']);

	if (scanError) {
		throw new Error(`SCAN_FAILED: failed to query escrows — ${scanError.message}`);
	}

	const escrows = (rows ?? []) as EscrowWithOrder[];

	const summary: SettleSummary = {
		scanned: escrows.length,
		skippedNoTracking: 0,
		marked: 0,
		released: 0,
		noop: 0,
		errors: 0,
		refundEligible: 0,
		traced: 0,
		traceErrors: 0,
	};

	// biome-ignore lint/suspicious/noConsole: intentional CLI output
	console.log(`[settle-escrows] scanned ${summary.scanned} eligible escrow(s)`);

	// -------------------------------------------------------------------------
	// Step 2: Process each escrow independently; one failure must not abort the
	// rest (per acceptance criteria).
	// -------------------------------------------------------------------------
	const nowMs = Date.now();

	for (const escrow of escrows) {
		const orderId = escrow.order_id;
		let countedRefundEligible = false;

		try {
			// -------------------------------------------------------------------
			// 2a. Refund-eligible logging (pending + ship_deadline elapsed).
			//     The keeper NEVER refunds — this is informational only.
			// -------------------------------------------------------------------
			if (escrow.status === 'pending') {
				const shipDeadlineMs = new Date(escrow.ship_deadline).getTime();
				if (nowMs >= shipDeadlineMs) {
					summary.refundEligible += 1;
					countedRefundEligible = true;
					// biome-ignore lint/suspicious/noConsole: intentional CLI output
					console.warn(
						`[settle-escrows] order=${orderId} REFUND_ELIGIBLE — ship deadline ${escrow.ship_deadline} has elapsed; buyer may initiate a refund (keeper will not)`,
					);
					// Still attempt oracle check below — carrier may have updated status.
					// The delegated mark_shipped will throw SHIP_DEADLINE_EXCEEDED and we
					// catch+log it cleanly.
				}
			}

			// -------------------------------------------------------------------
			// 2b. Skip if tracking information is missing (no-tracking fallback).
			// -------------------------------------------------------------------
			const carrier = escrow.orders?.carrier;
			const trackingNumber = escrow.orders?.tracking_number;

			if (!carrier || !trackingNumber) {
				summary.skippedNoTracking += 1;
				// biome-ignore lint/suspicious/noConsole: intentional CLI output
				console.log(
					`[settle-escrows] order=${orderId} SKIP — no tracking number registered (carrier=${carrier ?? 'null'}, tracking=${trackingNumber ?? 'null'}); manual flow applies`,
				);
				continue;
			}

			// -------------------------------------------------------------------
			// 2c. Fetch + verify oracle attestation.
			//     prepareCommitment throws on bad signature or response mismatch
			//     — the catch block below ensures the escrow is skipped safely.
			// -------------------------------------------------------------------
			// biome-ignore lint/suspicious/noConsole: intentional CLI output
			console.log(
				`[settle-escrows] order=${orderId} fetching oracle attestation (carrier=${carrier}, tracking=${trackingNumber})`,
			);

			const { attestation } = await oracleClient.prepareCommitment(orderId, carrier, trackingNumber);
			const oracleStatus = attestation.data.status;

			// biome-ignore lint/suspicious/noConsole: intentional CLI output
			console.log(`[settle-escrows] order=${orderId} oracle_status=${oracleStatus}`);

			// -------------------------------------------------------------------
			// 2d. Pure decision
			// -------------------------------------------------------------------
			const action = decideEscrowAction(escrow, oracleStatus, nowMs);

			// biome-ignore lint/suspicious/noConsole: intentional CLI output
			console.log(`[settle-escrows] order=${orderId} decision=${action}`);

			// -------------------------------------------------------------------
			// 2e. Act — delegate to the existing transition scripts
			// -------------------------------------------------------------------
			if (dryRun) {
				// biome-ignore lint/suspicious/noConsole: intentional CLI output
				console.log(`[settle-escrows] order=${orderId} DRY RUN — would execute action=${action}`);
				if (action === 'mark_shipped') summary.marked += 1;
				else if (action === 'release') summary.released += 1;
				else summary.noop += 1;
				continue;
			}

			if (action === 'mark_shipped') {
				try {
					const result = await markShippedMain(['--order-id', orderId]);
					summary.marked += 1;
					// biome-ignore lint/suspicious/noConsole: intentional CLI output
					console.log(
						`[settle-escrows] order=${orderId} MARKED_SHIPPED tx=${result.txHash}${result.explorerUrl ? ` | ${result.explorerUrl}` : ''}`,
					);
					if (traceability) {
						const ok = await syncOrderTraceability('shipped', orderId, trackingNumber);
						if (ok) summary.traced += 1;
						else summary.traceErrors += 1;
					}
				} catch (markErr) {
					const msg = markErr instanceof Error ? markErr.message : String(markErr);
					if (msg.startsWith('SHIP_DEADLINE_EXCEEDED')) {
						// The ship deadline passed between our scan and the delegated call.
						// The buyer is now eligible to claim a refund. Log clearly.
						// biome-ignore lint/suspicious/noConsole: intentional CLI output
						console.warn(
							`[settle-escrows] order=${orderId} SHIP_DEADLINE_EXCEEDED — escrow is now refund-eligible for the buyer; mark_shipped rejected: ${msg}`,
						);
						// Expected business state, not a processing error. Count as
						// refund-eligible unless the pre-oracle check above already did.
						if (!countedRefundEligible) {
							summary.refundEligible += 1;
						}
					} else {
						throw markErr; // re-throw for the outer catch
					}
				}
			} else if (action === 'release') {
				const result = await releaseMain(['--order-id', orderId]);
				summary.released += 1;
				// biome-ignore lint/suspicious/noConsole: intentional CLI output
				console.log(
					`[settle-escrows] order=${orderId} RELEASED tx=${result.txHash}${result.explorerUrl ? ` | ${result.explorerUrl}` : ''}`,
				);
				if (traceability) {
					const ok = await syncOrderTraceability('completed', orderId, trackingNumber);
					if (ok) summary.traced += 1;
					else summary.traceErrors += 1;
				}
			} else {
				// action === 'none'
				summary.noop += 1;
				// biome-ignore lint/suspicious/noConsole: intentional CLI output
				console.log(`[settle-escrows] order=${orderId} NOOP — no action required`);
			}
		} catch (err) {
			summary.errors += 1;
			// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
			console.error(
				`[settle-escrows] order=${orderId} ERROR — skipping escrow:`,
				err instanceof Error ? err.message : String(err),
			);
		}
	}

	return summary;
}

// ---------------------------------------------------------------------------
// main — exported for testability and e2e injection
// ---------------------------------------------------------------------------

export async function main(
	args: string[],
	oracleClient?: OracleClient,
): Promise<SettleSummary> {
	const { values } = parseArgs({
		args,
		options: {
			'dry-run': { type: 'boolean' },
			'no-traceability': { type: 'boolean' },
		},
		strict: true,
	});

	const dryRun = values['dry-run'] ?? false;
	const traceability = !(values['no-traceability'] ?? false);

	return settleEscrows({ oracleClient, dryRun, traceability });
}

// ---------------------------------------------------------------------------
// CLI entry point — only runs when this file is executed directly
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noConsole: intentional CLI output
async function run() {
	try {
		const summary = await main(process.argv.slice(2));

		// biome-ignore lint/suspicious/noConsole: intentional CLI output
		console.log('[settle-escrows] Summary:', {
			scanned: summary.scanned,
			skippedNoTracking: summary.skippedNoTracking,
			marked: summary.marked,
			released: summary.released,
			noop: summary.noop,
			errors: summary.errors,
			refundEligible: summary.refundEligible,
				traced: summary.traced,
				traceErrors: summary.traceErrors,
		});

		if (summary.errors > 0) {
			// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
			console.error(`[settle-escrows] ${summary.errors} escrow(s) encountered errors — check logs above`);
		}
	} catch (err) {
		// Fatal (non-per-escrow) error — env missing, Supabase scan failed, etc.
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[settle-escrows] FATAL ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

// Detect direct execution (tsx runs the file directly, not via import)
const isDirectRun =
	process.argv[1]?.endsWith('settle-escrows.ts') || process.argv[1]?.endsWith('settle-escrows.js');

if (isDirectRun) {
	void run();
}
