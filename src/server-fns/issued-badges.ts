import { createClient } from '@supabase/supabase-js';

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

type InsertIssuedBadgeData = Pick<
	Database.IssuedBadge,
	| 'kind'
	| 'recipient_pkh'
	| 'recipient_address'
	| 'triggering_order_id'
	| 'policy_id'
	| 'asset_name_hex'
	| 'mint_tx_hash'
	| 'metadata'
>;

export async function insertIssuedBadge(data: InsertIssuedBadgeData): Promise<Database.IssuedBadge> {
	const supabase = getServerSupabase();

	const { data: inserted, error } = await supabase.from('issued_badges').insert(data).select().single();

	if (error) {
		if (error.code === '23505') {
			const { data: existing } = await supabase
				.from('issued_badges')
				.select('mint_tx_hash')
				.eq('kind', data.kind)
				.eq('recipient_pkh', data.recipient_pkh)
				.single();

			throw new Error(
				`BADGE_ALREADY_ISSUED: kind=${data.kind}, recipient_pkh=${data.recipient_pkh}, mint_tx_hash=${existing?.mint_tx_hash ?? 'unknown'}`,
			);
		}
		throw new Error(error.message);
	}

	return inserted as Database.IssuedBadge;
}

export async function listBadgesByRecipient(address: string): Promise<Database.IssuedBadge[]> {
	const supabase = getServerSupabase();

	const { data, error } = await supabase
		.from('issued_badges')
		.select('*')
		.eq('recipient_address', address)
		.order('minted_at', { ascending: false });

	if (error) {
		throw new Error(error.message);
	}

	return (data ?? []) as Database.IssuedBadge[];
}

export async function listBadgesByOrder(orderId: string): Promise<Database.IssuedBadge[]> {
	const supabase = getServerSupabase();

	const { data, error } = await supabase
		.from('issued_badges')
		.select('*')
		.eq('triggering_order_id', orderId)
		.order('minted_at', { ascending: true });

	if (error) {
		throw new Error(error.message);
	}

	return (data ?? []) as Database.IssuedBadge[];
}
