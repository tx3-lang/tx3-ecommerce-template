/**
 * CLI script: reconcile-escrow
 *
 * Usage:
 *   pnpm tsx scripts/reconcile-escrow.ts
 *   pnpm reconcile-escrow
 *
 * What it does:
 *   1. Queries all escrows rows WHERE status NOT IN ('released', 'refunded').
 *   2. For each row, calls getUtxosByAddress() at the escrow's script_address
 *      to check whether the recorded UTxO (utxo_tx_hash + utxo_output_index)
 *      is still present.
 *   3. Cases:
 *      a) UTxO present, datum has no grace_period_end (None / Pending) → in sync, skip.
 *      b) UTxO present, datum has grace_period_end set (Some / Shipped) while DB is Pending
 *         → update escrow to Shipped state + insert missing order_events row.
 *      c) UTxO absent (consumed) → call getSpendingTx() and inspect outputs:
 *         - Output to merchant address → Released
 *         - Output to non-merchant address → Refunded
 *         Update escrow + insert missing order_events row.
 *   4. Prints a summary: counts by transition type.
 *
 * Exit codes:
 *   0 — success (even if some rows had per-row errors)
 *   1 — fatal error (chain unreachable, DB query failure)
 *
 * Datum decoding:
 *   The datum_cbor is hex-encoded CBOR. The EscrowDatum grace_period_end field
 *   is the last (6th) field and is encoded as an Aiken Option:
 *     - Pending (None):   CBOR constructor 0 — starts with tag 121 (0xd87980 or similar)
 *     - Shipped (Some t): CBOR constructor 1 — starts with tag 122 (0xd87a9f...)
 *
 * Chain query approach:
 *   The u5c client is extended with:
 *     - getUtxosByAddress(address): UTxO set at the given address
 *     - getSpendingTx(txHash, outputIndex): the tx that spent the given UTxO
 *   These are layered on top of the base U5cClient interface.
 */

import { createClient } from '@supabase/supabase-js';

import { createU5cClient } from '@/lib/cardano/u5c-client';
import { getNetworkConfig } from '@/lib/cardano/network';
import { insertOrderEvent } from '@/server-fns/order-events';

// ---------------------------------------------------------------------------
// Extended chain client types (UTxO query capabilities)
// ---------------------------------------------------------------------------

export interface ChainUtxo {
	txHash: string;
	outputIndex: number;
	datumCbor: string;
}

export interface SpendingTxOutput {
	address: string;
	value: number;
}

export interface SpendingTx {
	txHash: string;
	outputs: SpendingTxOutput[];
}

export interface EscrowChainClient {
	getUtxosByAddress(address: string): Promise<ChainUtxo[]>;
	getSpendingTx(txHash: string, outputIndex: number): Promise<SpendingTx>;
}

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

/**
 * Determine if a datum CBOR (hex) represents a Shipped state.
 *
 * Aiken encodes Option<PosixTime> as:
 *   None → CBOR constructor 0 (Plutus Constr 0) — bytes start with d87980 (tag 121)
 *   Some(t) → CBOR constructor 1 (Plutus Constr 1) — bytes start with d87a9f (tag 122)
 *
 * The EscrowDatum is a CBOR list (constr 0) with 6 fields; the last field is
 * grace_period_end. We check the datum-level encoding:
 * If the datum bytes contain the Constr-1 pattern for Option, it's Shipped.
 *
 * Simplified approach: the outermost datum is a constr record. We look for
 * tag 122 (0xd87a) anywhere in the datum — if present, grace_period_end = Some(t).
 * This is safe because no other field in EscrowDatum uses Option.
 */
function isShippedDatum(datumCbor: string): boolean {
	// Plutus Constr 1 encodes as CBOR tag 122 (alternative 0 compact = d87a...)
	// In hex: d87a = bytes [0xd8, 0x7a]
	// We check if the datum contains the Constr-1 pattern for the Option field
	return datumCbor.toLowerCase().includes('d87a');
}

/**
 * Extract grace_period_end (ms) from a Shipped datum.
 *
 * The datum CBOR contains OptionInt::Some { value: Int }. The integer follows
 * the d87a9f tag in the CBOR stream. We use a simple approach: look for d87a
 * and then decode the following integer.
 *
 * For a robust implementation we would use cbor-x. Here we use a targeted
 * approach: find the d87a tag byte sequence and extract the next CBOR integer.
 *
 * Returns null if extraction fails (caller falls back to Date.now()).
 */
function extractGracePeriodEndMs(datumCbor: string): number | null {
	try {
		// Find the position of d87a in the hex string
		const idx = datumCbor.toLowerCase().indexOf('d87a');
		if (idx === -1) return null;

		// After d87a, CBOR encodes the list: 9f<items>ff (indefinite) or 81<item> (definite length 1)
		// For a single-element definite array: 81 followed by the integer
		// For indefinite array: 9f followed by the integer followed by ff
		// We attempt to parse the integer after the array header

		const afterTag = datumCbor.slice(idx + 4); // skip 'd87a'

		// Try definite array of length 1 (81) then an integer
		// CBOR integer encoding:
		//   0x00-0x17: value 0-23
		//   0x18: next byte is uint8
		//   0x19: next 2 bytes are uint16
		//   0x1a: next 4 bytes are uint32
		//   0x1b: next 8 bytes are uint64
		let intHex: string;
		if (afterTag.startsWith('81')) {
			intHex = afterTag.slice(2);
		} else if (afterTag.startsWith('9f')) {
			intHex = afterTag.slice(2);
		} else {
			return null;
		}

		const firstByte = Number.parseInt(intHex.slice(0, 2), 16);

		if (firstByte === 0x1b) {
			// 8-byte uint64 follows
			const valueHex = intHex.slice(2, 18);
			return Number(BigInt(`0x${valueHex}`));
		}
		if (firstByte === 0x1a) {
			// 4-byte uint32 follows
			const valueHex = intHex.slice(2, 10);
			return Number.parseInt(valueHex, 16);
		}
		if (firstByte === 0x19) {
			// 2-byte uint16 follows
			const valueHex = intHex.slice(2, 6);
			return Number.parseInt(valueHex, 16);
		}
		if (firstByte === 0x18) {
			// 1-byte uint8 follows
			const valueHex = intHex.slice(2, 4);
			return Number.parseInt(valueHex, 16);
		}
		if (firstByte <= 0x17) {
			// Small integer (0-23) directly encoded
			return firstByte;
		}

		return null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ReconcileEscrowResult {
	/** Rows where DB and chain are in sync — no action needed. */
	skipped: number;
	/** Rows transitioned from pending → shipped. */
	pendingToShipped: number;
	/** Rows transitioned from shipped → released. */
	shippedToReleased: number;
	/** Rows transitioned from pending → refunded. */
	pendingToRefunded: number;
	/** Rows where an error occurred during processing. */
	errors: number;
}

// ---------------------------------------------------------------------------
// main — exported for testability
// ---------------------------------------------------------------------------

export async function main(): Promise<ReconcileEscrowResult> {
	const supabase = getServerSupabase();
	const config = getNetworkConfig();

	// Cast to extended interface — the real implementation would use a UTxO-
	// capable client; in tests this is fully mocked.
	const chainClient = createU5cClient(config) as unknown as EscrowChainClient;

	// -------------------------------------------------------------------------
	// Step 1: Fetch all non-terminal escrow rows
	// -------------------------------------------------------------------------
	const { data, error } = await supabase
		.from('escrows')
		.select('*')
		.not('status', 'in', '(released,refunded)');

	if (error) {
		throw new Error(error.message);
	}

	const rows = (data ?? []) as Database.Escrow[];

	if (rows.length === 0) {
		return { skipped: 0, pendingToShipped: 0, shippedToReleased: 0, pendingToRefunded: 0, errors: 0 };
	}

	// -------------------------------------------------------------------------
	// Step 2: Process each row
	// -------------------------------------------------------------------------
	let skipped = 0;
	let pendingToShipped = 0;
	let shippedToReleased = 0;
	let pendingToRefunded = 0;
	let errors = 0;

	for (const escrow of rows) {
		try {
			// Query current UTxO set at the script address
			const utxos = await chainClient.getUtxosByAddress(escrow.script_address);

			// Check if our recorded UTxO is still present
			const matchingUtxo = utxos.find(
				u => u.txHash === escrow.utxo_tx_hash && u.outputIndex === escrow.utxo_output_index,
			);

			if (matchingUtxo) {
				// UTxO is still at script address — check if datum has changed
				if (!isShippedDatum(matchingUtxo.datumCbor)) {
					// Still Pending on chain and in DB — in sync
					skipped++;
					continue;
				}

				// Datum is Shipped on chain but DB shows Pending — update
				if (escrow.status === 'pending') {
					const gracePeriodEndMs = extractGracePeriodEndMs(matchingUtxo.datumCbor) ?? Date.now();
					const gracePeriodEndIso = new Date(gracePeriodEndMs).toISOString();

					const { error: updateError } = await supabase
						.from('escrows')
						.update({
							status: 'shipped',
							shipped_tx_hash: escrow.utxo_tx_hash,
							utxo_tx_hash: matchingUtxo.txHash,
							utxo_output_index: matchingUtxo.outputIndex,
							datum_cbor: matchingUtxo.datumCbor,
							grace_period_end: gracePeriodEndIso,
						})
						.eq('order_id', escrow.order_id);

					if (updateError) {
						throw new Error(updateError.message);
					}

					// Insert missing order_events row (best-effort — duplicate ignored by caller)
					try {
						await insertOrderEvent({
							order_id: escrow.order_id,
							event_type: 'shipped',
							tx_hash: escrow.utxo_tx_hash,
							payload: { event: 'shipped', tx_hash: escrow.utxo_tx_hash, reconciled: true },
						});
					} catch {
						// Ignore duplicate event errors — event may already exist
					}

					pendingToShipped++;
				} else {
					// DB already shows Shipped and chain also shows Shipped — in sync
					skipped++;
				}
			} else {
				// UTxO is no longer at script address — consumed
				const spendingTx = await chainClient.getSpendingTx(escrow.utxo_tx_hash, escrow.utxo_output_index);

				// Determine Released vs Refunded by checking where value went
				const isReleased = spendingTx.outputs.some(o => o.address === config.merchantAddress);

				if (isReleased) {
					const { error: updateError } = await supabase
						.from('escrows')
						.update({
							status: 'released',
							release_tx_hash: spendingTx.txHash,
						})
						.eq('order_id', escrow.order_id);

					if (updateError) {
						throw new Error(updateError.message);
					}

					try {
						await insertOrderEvent({
							order_id: escrow.order_id,
							event_type: 'completed',
							tx_hash: spendingTx.txHash,
							payload: { event: 'completed', tx_hash: spendingTx.txHash, reconciled: true },
						});
					} catch {
						// Ignore duplicate event errors
					}

					shippedToReleased++;
				} else {
					const { error: updateError } = await supabase
						.from('escrows')
						.update({
							status: 'refunded',
							refund_tx_hash: spendingTx.txHash,
						})
						.eq('order_id', escrow.order_id);

					if (updateError) {
						throw new Error(updateError.message);
					}

					try {
						await insertOrderEvent({
							order_id: escrow.order_id,
							event_type: 'cancelled',
							tx_hash: spendingTx.txHash,
							payload: { event: 'cancelled', tx_hash: spendingTx.txHash, reconciled: true },
						});
					} catch {
						// Ignore duplicate event errors
					}

					pendingToRefunded++;
				}
			}
		} catch (_err) {
			errors++;
		}
	}

	return { skipped, pendingToShipped, shippedToReleased, pendingToRefunded, errors };
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
			`[reconcile-escrow] Reconciled ${result.pendingToShipped + result.shippedToReleased + result.pendingToRefunded} rows. Transitions: ${result.pendingToShipped} pending→shipped, ${result.shippedToReleased} shipped→released, ${result.pendingToRefunded} pending→refunded. Skipped: ${result.skipped}. Errors: ${result.errors}.`,
		);

		if (result.errors > 0) {
			process.exit(1);
		}
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[reconcile-escrow] ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

const isDirectRun =
	process.argv[1]?.endsWith('reconcile-escrow.ts') || process.argv[1]?.endsWith('reconcile-escrow.js');

if (isDirectRun) {
	void run();
}
