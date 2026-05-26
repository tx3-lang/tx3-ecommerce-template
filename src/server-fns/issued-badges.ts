import { createClient } from '@supabase/supabase-js';
import { createServerFn } from '@tanstack/react-start';
import { bech32 } from 'bech32';
import { z } from 'zod';

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

// Byte/hex helpers — kept Buffer-free so this module never pulls a Node-only
// import (`node:buffer`) into the client bundle; the route imports the
// createServerFn wrappers from here, so the module is part of the client graph.
function hexToBytes(hex: string): number[] {
	const bytes: number[] = [];
	for (let i = 0; i < hex.length; i += 2) {
		bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
	}
	return bytes;
}

function bytesToHex(bytes: ArrayLike<number>): string {
	let hex = '';
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, '0');
	}
	return hex;
}

/**
 * Recipient addresses are stored in the DB as CIP-30 hex (what wallets return),
 * but users most commonly copy the bech32 form (addr1.../addr_test1.../stake...).
 * Return every form we can derive from the input so the lookup matches whatever
 * shape was persisted, regardless of which the caller passed.
 */
function addressLookupVariants(address: string): string[] {
	const input = address.trim();
	const variants = new Set<string>([input]);

	try {
		if (input.startsWith('addr') || input.startsWith('stake')) {
			// bech32 → hex
			const { words } = bech32.decode(input, 1000);
			variants.add(bytesToHex(bech32.fromWords(words)));
		} else if (/^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0) {
			// hex → bech32
			const hex = input.toLowerCase();
			variants.delete(input);
			variants.add(hex);
			const addressType = hex.charAt(0);
			const networkId = Number(hex.charAt(1));
			const words = bech32.toWords(hexToBytes(hex));
			let prefix = ['e', 'f'].includes(addressType) ? 'stake' : 'addr';
			if (networkId === 0) prefix += '_test';
			variants.add(bech32.encode(prefix, words, 1000));
		}
	} catch {
		// Not a convertible address — fall back to the raw input only.
	}

	return [...variants];
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
		.in('recipient_address', addressLookupVariants(address))
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

/**
 * Server function wrappers — run the Supabase query on the server (where
 * SUPABASE_SECRET_KEY lives) and return the rows to the client over RPC.
 * Client/route code must import these (NOT the plain functions above), so the
 * service-role client never gets bundled into the browser.
 */
export const listBadgesByRecipientServerFn = createServerFn({ method: 'GET' })
	.inputValidator(z.object({ address: z.string().min(1, 'Address is required') }))
	.handler(async ({ data }) => listBadgesByRecipient(data.address));

export const listBadgesByOrderServerFn = createServerFn({ method: 'GET' })
	.inputValidator(z.object({ order_id: z.string().min(1, 'Order ID is required') }))
	.handler(async ({ data }) => listBadgesByOrder(data.order_id));
