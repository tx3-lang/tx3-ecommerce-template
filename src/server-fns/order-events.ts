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

type InsertOrderEventData = Pick<Database.OrderEvent, 'order_id' | 'event_type' | 'tx_hash' | 'payload'> &
	Partial<Pick<Database.OrderEvent, 'confirmed_at'>>;

/**
 * Insert a new order_events row.
 *
 * On unique-constraint violation (SQLSTATE 23505) throws a typed
 * `DUPLICATE_EVENT: order_id=<id>, event_type=<type>` error.
 * All other Supabase errors are rethrown as-is.
 */
export async function insertOrderEvent(eventData: InsertOrderEventData): Promise<Database.OrderEvent> {
	const supabase = getServerSupabase();

	const { data, error } = await supabase.from('order_events').insert(eventData).select().single();

	if (error) {
		if (error.code === '23505') {
			throw new Error(`DUPLICATE_EVENT: order_id=${eventData.order_id}, event_type=${eventData.event_type}`);
		}
		throw new Error(error.message);
	}

	return data as Database.OrderEvent;
}

/**
 * List all events for a given order, ordered by submitted_at ascending.
 */
export async function listOrderEvents(orderId: string): Promise<Database.OrderEvent[]> {
	const supabase = getServerSupabase();

	const { data, error } = await supabase
		.from('order_events')
		.select('*')
		.eq('order_id', orderId)
		.order('submitted_at', { ascending: true });

	if (error) {
		throw new Error(error.message);
	}

	return (data ?? []) as Database.OrderEvent[];
}

/**
 * Mark an order_events row as confirmed by setting confirmed_at = NOW().
 */
export async function markEventConfirmed(eventId: string): Promise<void> {
	const supabase = getServerSupabase();

	const { error } = await supabase
		.from('order_events')
		.update({ confirmed_at: new Date().toISOString() })
		.eq('id', eventId);

	if (error) {
		throw new Error(error.message);
	}
}
