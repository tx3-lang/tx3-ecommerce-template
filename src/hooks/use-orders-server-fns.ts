import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
// Hooks para llamar server functions con validación automática
import {
	createOrdersServerFn,
	getOrderServerFn,
	getUserOrdersServerFn,
	updateOrderStatusServerFn,
	validateAndReserveStockServerFn,
} from '@/server-fns/orders';

/**
 * Unified hook to create orders (single or multiple)
 * Always returns Database.Order[] for consistency
 * Single order → [order]
 * Multi-currency → [order1, order2, ...]
 */
export function useCreateOrders() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: {
			wallet_address: string;
			orders: Array<{
				items: Database.OrderItemInput[];
				token_id?: string | null;
			}>;
			shipping_info?: {
				fullName: string;
				email: string;
				phone?: string;
				address: string;
				city: string;
				postalCode: string;
				country: string;
			};
		}) => {
			const result = await createOrdersServerFn({ data });

			if (!result.success) {
				throw new Error(result.message || 'Failed to create orders');
			}

			return result.orders;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['products'] });
			queryClient.invalidateQueries({ queryKey: ['orders'] });
			queryClient.invalidateQueries({ queryKey: ['available-stock'] });
			queryClient.invalidateQueries({ queryKey: ['user-orders'] });
		},
		onError: error => {
			console.error('Order creation failed:', error);
		},
	});
}

/**
 * Hook to validate stock availability and reserve items for checkout
 * Must be called before order creation to ensure items are available
 */
export function useValidateBulkStock() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (items: Array<{ product_id: string; quantity: number }>) => {
			const result = await validateAndReserveStockServerFn({
				data: {
					cart_items: items,
					reservation_minutes: 30,
				},
			});

			if (!result.success) {
				throw new Error(result.message || 'Stock validation failed');
			}

			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['products'] });
			queryClient.invalidateQueries({ queryKey: ['available-stock'] });
		},
		onError: error => {
			console.error('Stock validation failed:', error);
		},
	});
}

// Update order status mutation usando server function
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
			// Llamar a server function con validación automática
			const result = await updateOrderStatusServerFn({
				data: {
					order_id: orderId,
					status,
					tx_hash: txHash || undefined,
					error: error || undefined,
				},
			});

			if (!result.success) {
				throw new Error(result.message || 'Failed to update order status');
			}

			return result.order;
		},
		onSuccess: (data, variables) => {
			// Actualizar caché con el estado nuevo
			queryClient.setQueryData(['order', variables.orderId], data);
			queryClient.invalidateQueries({ queryKey: ['orders'] });
			queryClient.invalidateQueries({ queryKey: ['user-orders'] });
			queryClient.invalidateQueries({ queryKey: ['available-stock'] });
		},
		onError: error => {
			console.error('Order status update failed:', error);
		},
	});
}

// Obtener órdenes de usuario usando server function
export function useOrders(walletAddress?: string) {
	return useQuery({
		queryKey: ['user-orders', walletAddress],
		queryFn: async () => {
			if (!walletAddress) return [];

			const result = await getUserOrdersServerFn({
				data: { wallet_address: walletAddress },
			});

			if (!result.success) {
				throw new Error('Failed to fetch orders');
			}

			return result.orders || [];
		},
		enabled: !!walletAddress,
		staleTime: 2 * 60 * 1000, // 2 minutos
	});
}

// Obtener orden individual usando server function
export function useOrder(orderId?: string) {
	return useQuery({
		queryKey: ['order', orderId],
		queryFn: async () => {
			if (!orderId) return null;

			const result = await getOrderServerFn({
				data: { order_id: orderId },
			});

			if (!result.success) {
				throw new Error('Failed to fetch order');
			}

			return result.order || null;
		},
		enabled: !!orderId,
		staleTime: 5 * 60 * 1000, // 5 minutos
	});
}

// Marcar orden como timeout
export function useMarkOrderTimeout() {
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
			console.log('Order marked as timed out');
		},
		onError: error => {
			console.error('Failed to mark order as timeout:', error);
		},
	});
}
