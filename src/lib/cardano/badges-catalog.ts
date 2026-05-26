import type { SupabaseClient } from '@supabase/supabase-js';

export type BadgeKind = 'buyer_first_purchase' | 'seller_first_delivery';

export interface BadgeCatalogEntry {
	kind_id: number;
	name: string;
	description: string;
	ipfs_image_cid: string;
	recipient_role: 'buyer' | 'merchant';
	eligibility: (orderId: string, dbClient: SupabaseClient) => Promise<boolean>;
}

export const BADGES_CATALOG: Record<BadgeKind, BadgeCatalogEntry> = {
	buyer_first_purchase: {
		kind_id: 1,
		name: 'First Purchase',
		description: 'Awarded for completing your first purchase in this store.',
		ipfs_image_cid: 'ipfs://bafyplaceholder1buyerfirstpurchase',
		recipient_role: 'buyer',
		eligibility: async (orderId: string, dbClient: SupabaseClient) => {
			const { data: escrow, error: escrowErr } = await dbClient
				.from('escrows')
				.select('buyer_pkh')
				.eq('order_id', orderId)
				.single();

			if (escrowErr) throw new Error(escrowErr.message);
			if (!escrow) throw new Error(`No escrow found for order ${orderId}`);

			const { count, error: countErr } = await dbClient
				.from('escrows')
				.select('*', { count: 'exact', head: true })
				.eq('status', 'released')
				.eq('buyer_pkh', escrow.buyer_pkh)
				.single();

			if (countErr) throw new Error(countErr.message);
			return count === 1;
		},
	},
	seller_first_delivery: {
		kind_id: 2,
		name: 'First Delivery',
		description: 'Awarded for completing your first delivery as a merchant.',
		ipfs_image_cid: 'ipfs://bafyplaceholder2sellerfirstdelivery',
		recipient_role: 'merchant',
		eligibility: async (_orderId: string, dbClient: SupabaseClient) => {
			const { count, error } = await dbClient
				.from('escrows')
				.select('*', { count: 'exact', head: true })
				.eq('status', 'released')
				.single();

			if (error) throw new Error(error.message);
			return count === 1;
		},
	},
};

export function getCatalogEntry(kind: BadgeKind): BadgeCatalogEntry {
	return BADGES_CATALOG[kind];
}
