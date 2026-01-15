import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Lib
import { supabase } from '@/lib/supabase';

// Create order mutation
export function useCreateOrder() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: Database.CreateOrderData): Promise<Database.Order> => {
			// Start a transaction-like operation
			const { data: orderData, error: orderError } = await supabase
				.from('orders')
				.insert({
					wallet_address: data.wallet_address,
					total_lovelace: data.total_lovelace,
					status: 'pending',
				})
				.select()
				.single();

			if (orderError) throw orderError;

			// Insert order items with price snapshot
			const orderItems = data.items.map(item => ({
				order_id: orderData.id,
				product_id: item.product_id,
				quantity: item.quantity,
				price_lovelace: item.price_lovelace,
			}));

			const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

			if (itemsError) throw itemsError;

			return orderData;
		},
		onSuccess: () => {
			// Invalidate products cache for stock updates
			queryClient.invalidateQueries({ queryKey: ['products'] });
			queryClient.invalidateQueries({ queryKey: ['orders'] });
		},
	});
}

// Update order status mutation
export function useUpdateOrderStatus() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			orderId,
			status,
			txHash,
			error,
		}: {
			orderId: string;
			status: Database.OrderStatus;
			txHash?: string | null;
			error?: string | null;
		}) => {
			const updateData: Partial<Database.Order> = {
				status,
				updated_at: new Date().toISOString(),
			};

			if (txHash) {
				updateData.cardano_tx_hash = txHash;
			}

			if (error) {
				updateData.payment_error = error;
			}

			const { data: orderData, error: updateError } = await supabase
				.from('orders')
				.update(updateData)
				.eq('id', orderId)
				.select()
				.single();

			if (updateError) throw updateError;

			return orderData;
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: ['orders'] });
			queryClient.setQueryData(['order', variables.orderId], data);
		},
	});
}

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
						price_lovelace,
						products:product_id (
							name,
							description,
							product_images (
								image_url,
								alt_text,
								display_order
							)
						)
					)
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
export function useOrder(orderId?: string) {
	return useQuery<Database.Order>({
		queryKey: ['order', orderId],
		queryFn: async () => {
			if (!orderId) return null;

			const { data, error } = await supabase
				.from('orders')
				.select(`
					*,
					order_items (
						product_id,
						quantity,
						price_lovelace,
						products:product_id (
							name,
							description,
							product_images (
								image_url,
								alt_text,
								display_order
							)
						)
					)
				`)
				.eq('id', orderId)
				.single();

			if (error) throw error;
			return data;
		},
		enabled: !!orderId,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Mark order as timeout mutation
export function useMarkOrderTimeout() {
	const queryClient = useQueryClient();
	const updateOrderStatus = useUpdateOrderStatus();

	return useMutation({
		mutationFn: async (orderId: string) => {
			return updateOrderStatus.mutateAsync({
				orderId,
				status: 'payment_failed',
				error: 'Payment timeout after 60 seconds',
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['orders'] });
		},
	});
}
