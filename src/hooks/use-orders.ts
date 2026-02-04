import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Lib
import { createOrderWithStockReservation, updateOrderStatus } from '@/lib/order-api';
import { reserveBulkStock } from '@/lib/stock-reservation';
import { supabase } from '@/lib/supabase';

// Create order mutation with stock reservation
export function useCreateOrder() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: Database.CreateOrderData): Promise<Database.Order> => {
			// Use the new order creation API with stock reservation
			const result = await createOrderWithStockReservation(data);

			if (!result.success) {
				throw new Error(result.error || 'Failed to create order');
			}

			if (!result.order) {
				throw new Error('Order was not created');
			}

			// Reserve stock for all items in the order
			const reservationResult = await reserveBulkStock(
				result.order.id,
				data.items.map(item => ({
					product_id: item.product_id,
					quantity: item.quantity,
				})),
			);

			if (!reservationResult.success) {
				// Rollback order creation if reservation fails
				throw new Error(reservationResult.error || 'Failed to reserve stock');
			}

			return result.order;
		},
		onSuccess: () => {
			// Invalidate products cache for stock updates
			queryClient.invalidateQueries({ queryKey: ['products'] });
			queryClient.invalidateQueries({ queryKey: ['orders'] });
			queryClient.invalidateQueries({ queryKey: ['available-stock'] });
		},
		onError: error => {
			console.error('Order creation failed:', error);
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
			const result = await updateOrderStatus(orderId, status, txHash || undefined, error || undefined);

			if (!result.success) {
				throw new Error(result.error || 'Failed to update order status');
			}

			// Fetch the updated order data
			const { data: orderData, error: fetchError } = await supabase
				.from('orders')
				.select('*')
				.eq('id', orderId)
				.single();

			if (fetchError) {
				throw new Error(`Failed to fetch updated order: ${fetchError.message}`);
			}

			return orderData;
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: ['orders'] });
			queryClient.setQueryData(['order', variables.orderId], data);
			queryClient.invalidateQueries({ queryKey: ['available-stock'] });
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
