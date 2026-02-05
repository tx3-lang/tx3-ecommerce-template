import { useQuery } from '@tanstack/react-query';

// Lib
import { supabase } from '@/lib/supabase';

// Get orders for a wallet
export function useOrders(walletAddress?: string) {
	return useQuery({
		queryKey: ['orders', walletAddress],
		queryFn: async () => {
			if (!walletAddress) return [];

			const { data, error } = await supabase
				.from('orders')
				.select(`
					*,
					order_items (
						product_id,
						quantity,
						price,
						token_id,
						products:product_id (
							name,
							description,
							product_images (
								image_url,
								alt_text,
								display_order
							)
						)
					),
					supported_tokens (policy_id, asset_name, display_name, decimals)
				`)
				.eq('wallet_address', walletAddress)
				.is('deleted_at', null)
				.order('created_at', { ascending: false });

			if (error) throw error;
			return data || [];
		},
		enabled: !!walletAddress,
		staleTime: 2 * 60 * 1000, // 2 minutes
	});
}

// Get single order
export function useOrder(orderId?: string, walletAddress?: string) {
	return useQuery<Database.Order>({
		queryKey: ['order', orderId, walletAddress],
		queryFn: async () => {
			if (!orderId || !walletAddress) return null;

			const { data, error } = await supabase
				.from('orders')
				.select(`
					*,
					order_items (
						product_id,
						quantity,
						price,
						token_id,
						products:product_id (
							name,
							description,
							product_images (
								image_url,
								alt_text,
								display_order
							)
						)
					),
					supported_tokens (policy_id, asset_name, display_name, decimals)
				`)
				.eq('id', orderId)
				.eq('wallet_address', walletAddress)
				.is('deleted_at', null)
				.single();

			if (error) throw error;
			return data;
		},
		enabled: !!orderId && !!walletAddress,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}
