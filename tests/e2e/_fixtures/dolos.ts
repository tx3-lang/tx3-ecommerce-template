/**
 * Shared E2E fixtures for dolos-backed escrow tests.
 *
 * Requirements to run e2e tests (all via env vars):
 *   VITE_SUPABASE_URL           — Supabase project URL (local or remote)
 *   SUPABASE_SECRET_KEY         — Service-role key (bypasses RLS)
 *   TX3_TRP_ENDPOINT            — TRP endpoint e.g. http://localhost:8164
 *   TX3_PROFILE                 — "local"
 *   MERCHANT_ADDRESS            — bech32 address pre-funded with test ADA
 *   MERCHANT_SKEY               — hex-encoded Ed25519 private key (32 bytes)
 *   TEST_BUYER_SKEY             — hex-encoded Ed25519 private key (32 bytes)
 *   TEST_BUYER_ADDRESS          — bech32 address pre-funded with test ADA
 *   ESCROW_SHIP_DEADLINE_SECONDS— set to 60 for e2e
 *   ESCROW_GRACE_PERIOD_SECONDS — set to 60 for e2e
 *
 * If any of the required env vars are missing, the `requireE2eEnv()` guard
 * will throw, and the caller should wrap the test suite in `describe.skipIf()`.
 */

import { createClient } from '@supabase/supabase-js';
import { main as markShipped } from '../../../scripts/escrow-mark-shipped.js';
import { main as releaseEscrow } from '../../../scripts/escrow-release.js';

// ---------------------------------------------------------------------------
// Environment check
// ---------------------------------------------------------------------------

const REQUIRED_E2E_VARS = [
	'VITE_SUPABASE_URL',
	'SUPABASE_SECRET_KEY',
	'TX3_TRP_ENDPOINT',
	'TX3_PROFILE',
	'MERCHANT_ADDRESS',
	'MERCHANT_SKEY',
	'TEST_BUYER_SKEY',
	'TEST_BUYER_ADDRESS',
] as const;

/**
 * Returns true if all required e2e environment variables are set.
 * Used by `describe.skipIf` guards in each test file.
 */
export function isE2eConfigured(): boolean {
	return REQUIRED_E2E_VARS.every(v => {
		const val = process.env[v];
		return val !== undefined && val !== '';
	});
}

/**
 * Returns the list of missing required e2e env vars (for helpful skip messages).
 */
export function missingE2eVars(): string[] {
	return REQUIRED_E2E_VARS.filter(v => {
		const val = process.env[v];
		return val === undefined || val === '';
	});
}

// ---------------------------------------------------------------------------
// Supabase service-role client
// ---------------------------------------------------------------------------

export function getE2eSupabase() {
	const url = process.env.VITE_SUPABASE_URL;
	const key = process.env.SUPABASE_SECRET_KEY;

	if (!url || !key) {
		throw new Error('E2E: VITE_SUPABASE_URL and SUPABASE_SECRET_KEY are required');
	}

	return createClient(url, key, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

// ---------------------------------------------------------------------------
// Time advance helper
// ---------------------------------------------------------------------------

/**
 * Advances (real-wall-clock) time by waiting the specified number of seconds.
 *
 * Dolos devnet uses real-time slot progression
 * (`block_production_interval = 5` in dolos.toml — one block every 5s).
 * Tests that need to advance past a deadline should call `advanceTime(61)`
 * with `ESCROW_SHIP_DEADLINE_SECONDS=60` / `ESCROW_GRACE_PERIOD_SECONDS=60`.
 *
 * If/when dolos exposes a slot-advance API, replace `sleep` with an HTTP call
 * to that endpoint.
 */
export async function advanceTime(seconds: number): Promise<void> {
	await new Promise<void>(resolve => setTimeout(resolve, seconds * 1000));
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

export interface CreateTestOrderInput {
	walletAddress?: string;
	productId?: string;
	totalAmount?: number;
}

/**
 * Creates a minimal order row in the DB in 'pending' status.
 * Returns the new order id.
 *
 * Uses the service-role client so it bypasses RLS.
 */
export async function createTestOrder(opts: CreateTestOrderInput = {}): Promise<string> {
	const supabase = getE2eSupabase();

	const walletAddress = opts.walletAddress ?? process.env.TEST_BUYER_ADDRESS ?? 'addr_test1_e2e_buyer';
	const totalAmount = opts.totalAmount ?? 5_000_000; // 5 ADA in lovelace

	const { data, error } = await supabase
		.from('orders')
		.insert({
			wallet_address: walletAddress,
			total_amount: totalAmount,
			status: 'pending',
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`E2E: failed to create test order — ${error?.message ?? 'no data returned'}`);
	}

	return data.id as string;
}

/**
 * Retrieves the escrow row for an order from DB.
 * Returns null if no escrow exists yet.
 */
export async function getEscrowRow(orderId: string): Promise<Database.Escrow | null> {
	const supabase = getE2eSupabase();

	const { data, error } = await supabase
		.from('escrows')
		.select('*')
		.eq('order_id', orderId)
		.single();

	if (error) {
		if (error.code === 'PGRST116') return null;
		throw new Error(`E2E: failed to fetch escrow for order ${orderId} — ${error.message}`);
	}

	return data as Database.Escrow;
}

/**
 * Retrieves the order row from DB.
 */
export async function getOrderRow(orderId: string): Promise<Database.Order> {
	const supabase = getE2eSupabase();

	const { data, error } = await supabase
		.from('orders')
		.select('*')
		.eq('id', orderId)
		.single();

	if (error || !data) {
		throw new Error(`E2E: failed to fetch order ${orderId} — ${error?.message ?? 'no data returned'}`);
	}

	return data as Database.Order;
}

/**
 * Returns all order_events rows for an order, ordered by submitted_at.
 */
export async function getOrderEvents(orderId: string): Promise<Database.OrderEvent[]> {
	const supabase = getE2eSupabase();

	const { data, error } = await supabase
		.from('order_events')
		.select('*')
		.eq('order_id', orderId)
		.order('submitted_at', { ascending: true });

	if (error) {
		throw new Error(`E2E: failed to fetch events for order ${orderId} — ${error.message}`);
	}

	return (data ?? []) as Database.OrderEvent[];
}

/**
 * Deletes all test data for an order (issued_badges, order_events, escrows, orders) by order id.
 * Call in afterEach / afterAll to clean up between test runs.
 */
export async function cleanupOrder(orderId: string): Promise<void> {
	const supabase = getE2eSupabase();

	// Delete in dependency order — issued_badges does not reference orders
	// via FK but we clean it up here for badge e2e tests.
	await supabase.from('issued_badges').delete().eq('triggering_order_id', orderId);
	await supabase.from('order_events').delete().eq('order_id', orderId);
	await supabase.from('escrows').delete().eq('order_id', orderId);
	await supabase.from('orders').delete().eq('id', orderId);
}

// ---------------------------------------------------------------------------
// Lock-payment fixture helper
// ---------------------------------------------------------------------------

export interface LockPaymentFixtureInput {
	orderId: string;
	/** A real lock tx hash from dolos. In tests that need a real chain tx, pass the hash returned by the lock tx submission. */
	lockTxHash: string;
	lockOutputIndex?: number;
	/** Datum CBOR hex (EscrowDatum in pending state — grace_period_end = None) */
	datumCbor?: string;
	scriptAddress?: string;
	buyerPkh?: string;
	merchantPkh?: string;
	/**
	 * Optional carrier name (e.g. 'fedex'). When provided, written to orders.carrier
	 * so the keeper can resolve tracking. Stays null when omitted (no-tracking fallback).
	 */
	carrier?: string;
	/**
	 * Optional tracking number. When provided, written to orders.tracking_number
	 * so the keeper can query the oracle. Stays null when omitted (no-tracking fallback).
	 */
	trackingNumber?: string;
}

/**
 * Directly inserts an escrow + paid order_event row into DB simulating what
 * `handleLockPayment` does after the buyer's lock tx is submitted on-chain.
 *
 * This allows e2e tests to bypass the full checkout UI flow and start from
 * a known state (escrow pending, order paid) with a given lock tx hash.
 */
export async function insertLockPaymentFixture(input: LockPaymentFixtureInput): Promise<void> {
	const supabase = getE2eSupabase();

	const {
		orderId,
		lockTxHash,
		lockOutputIndex = 0,
		datumCbor = 'd87a80', // Aiken None = Constr 1 [] = pending (Option orders Some first)
		scriptAddress = process.env.E2E_SCRIPT_ADDRESS ?? 'addr_test1_e2e_script',
		buyerPkh = 'e2e_buyer_pkh',
		merchantPkh = 'e2e_merchant_pkh',
		carrier,
		trackingNumber,
	} = input;

	const now = new Date();
	const shipDeadlineMs = now.getTime() + (Number(process.env.ESCROW_SHIP_DEADLINE_SECONDS ?? 60)) * 1000;

	// Step 1: Insert escrow row
	const { error: escrowError } = await supabase.from('escrows').insert({
		order_id: orderId,
		script_address: scriptAddress,
		utxo_tx_hash: lockTxHash,
		utxo_output_index: lockOutputIndex,
		status: 'pending',
		buyer_pkh: buyerPkh,
		merchant_pkh: merchantPkh,
		paid_at: now.toISOString(),
		ship_deadline: new Date(shipDeadlineMs).toISOString(),
		datum_cbor: datumCbor,
	});

	if (escrowError) {
		throw new Error(`E2E: failed to insert escrow fixture — ${escrowError.message}`);
	}

	// Step 2: Update order status to 'paid', optionally setting carrier + tracking_number
	// so the keeper can resolve tracking info (Task 2 field storage on orders).
	const { error: orderError } = await supabase
		.from('orders')
		.update({ status: 'paid', cardano_tx_hash: lockTxHash, carrier, tracking_number: trackingNumber })
		.eq('id', orderId);

	if (orderError) {
		throw new Error(`E2E: failed to update order to paid — ${orderError.message}`);
	}

	// Step 3: Insert 'paid' order_events row
	const { error: eventError } = await supabase.from('order_events').insert({
		order_id: orderId,
		event_type: 'paid',
		tx_hash: lockTxHash,
		confirmed_at: now.toISOString(),
		payload: {
			v: 1,
			event: 'paid',
			tx_hash: lockTxHash,
			lock_output_index: lockOutputIndex,
		},
	});

	if (eventError) {
		throw new Error(`E2E: failed to insert paid event fixture — ${eventError.message}`);
	}
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

/**
 * Returns all issued_badges rows that were triggered by the given order.
 */
export async function getIssuedBadges(orderId: string): Promise<Database.IssuedBadge[]> {
	const supabase = getE2eSupabase();

	const { data, error } = await supabase
		.from('issued_badges')
		.select('*')
		.eq('triggering_order_id', orderId);

	if (error) {
		throw new Error(`E2E: failed to fetch issued_badges for order ${orderId} — ${error.message}`);
	}

	return (data ?? []) as Database.IssuedBadge[];
}

/**
 * Completes the full escrow lifecycle for a test order:
 *   lock payment fixture → mark-shipped → advance(61) → release
 *
 * Returns the orderId (same as input) so callers can chain assertions.
 */
export async function setupEscrowLifecycle(orderId: string): Promise<string> {
	const lockTxHash =
		process.env.E2E_LOCK_TX_HASH ??
		'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

	await insertLockPaymentFixture({
		orderId,
		lockTxHash,
		lockOutputIndex: 0,
	});

	const shippedResult = await markShipped([`--order-id`, orderId]);
	if (!shippedResult.txHash) throw new Error('E2E: mark-shipped returned empty txHash');

	await advanceTime(61);

	const releaseResult = await releaseEscrow([`--order-id`, orderId]);
	if (!releaseResult.txHash) throw new Error('E2E: release returned empty txHash');

	return orderId;
}

/**
 * Returns the recipient pkh that a given badge kind would be issued to,
 * by reading the escrow row from DB.
 *
 * Uses MERCHANT_ADDRESS for recipient_role='merchant' kind badges (seller-first-delivery).
 */
export async function getExpectedRecipientPkh(
	orderId: string,
	kind: Database.BadgeKind,
): Promise<string> {
	const escrow = await getEscrowRow(orderId);
	if (!escrow) throw new Error(`E2E: no escrow for order ${orderId}`);

	if (kind === 'buyer_first_purchase') return escrow.buyer_pkh;
	return escrow.merchant_pkh;
}
