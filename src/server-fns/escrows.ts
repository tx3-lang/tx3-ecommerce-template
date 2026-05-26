import { createClient } from '@supabase/supabase-js';

/**
 * Get server-side Supabase client with elevated privileges.
 * Uses the service-role / secret key which bypasses RLS policies.
 */
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

type InsertEscrowData = Pick<
	Database.Escrow,
	| 'order_id'
	| 'script_address'
	| 'utxo_tx_hash'
	| 'utxo_output_index'
	| 'status'
	| 'buyer_pkh'
	| 'merchant_pkh'
	| 'paid_at'
	| 'ship_deadline'
	| 'datum_cbor'
>;

export type EscrowTransition =
	| {
			type: 'shipped';
			shipped_tx_hash: string;
			utxo_tx_hash: string;
			utxo_output_index: number;
			datum_cbor: string;
			grace_period_end: string;
	  }
	| { type: 'released'; release_tx_hash: string }
	| { type: 'refunded'; refund_tx_hash: string };

/**
 * Insert a new escrows row.
 *
 * On unique-constraint violation (SQLSTATE 23505) throws a typed
 * `DUPLICATE_ESCROW: order_id=<id>` error (one-to-one with orders).
 * All other Supabase errors are rethrown as-is.
 */
export async function insertEscrow(escrowData: InsertEscrowData): Promise<Database.Escrow> {
	const supabase = getServerSupabase();

	const { data, error } = await supabase.from('escrows').insert(escrowData).select().single();

	if (error) {
		if (error.code === '23505') {
			throw new Error(`DUPLICATE_ESCROW: order_id=${escrowData.order_id}`);
		}
		throw new Error(error.message);
	}

	return data as Database.Escrow;
}

/**
 * Get the escrow row for a given order.
 * Returns null when no escrow exists for the order.
 */
export async function getEscrowByOrderId(orderId: string): Promise<Database.Escrow | null> {
	const supabase = getServerSupabase();

	const { data, error } = await supabase.from('escrows').select('*').eq('order_id', orderId).single();

	if (error) {
		// PGRST116 = "no rows returned" — treat as null, not an error
		if (error.code === 'PGRST116') {
			return null;
		}
		throw new Error(error.message);
	}

	return data as Database.Escrow;
}

/**
 * Apply a state transition to an escrow row identified by order_id.
 *
 * Transitions:
 *   pending → shipped   sets status, shipped_tx_hash, grace_period_end,
 *                        utxo_tx_hash, utxo_output_index, datum_cbor
 *   shipped → released  sets status, release_tx_hash
 *   pending → refunded  sets status, refund_tx_hash
 */
export async function updateEscrowState(orderId: string, transition: EscrowTransition): Promise<void> {
	const supabase = getServerSupabase();

	let fields: Partial<Database.Escrow>;

	if (transition.type === 'shipped') {
		fields = {
			status: 'shipped',
			shipped_tx_hash: transition.shipped_tx_hash,
			utxo_tx_hash: transition.utxo_tx_hash,
			utxo_output_index: transition.utxo_output_index,
			datum_cbor: transition.datum_cbor,
			grace_period_end: transition.grace_period_end,
		};
	} else if (transition.type === 'released') {
		fields = {
			status: 'released',
			release_tx_hash: transition.release_tx_hash,
		};
	} else {
		fields = {
			status: 'refunded',
			refund_tx_hash: transition.refund_tx_hash,
		};
	}

	const { error } = await supabase.from('escrows').update(fields).eq('order_id', orderId);

	if (error) {
		throw new Error(error.message);
	}
}
