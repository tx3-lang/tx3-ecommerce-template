import { useMutation, useQueryClient } from '@tanstack/react-query';

// Lib
import { supabase } from '@/lib/supabase';

// Create multiple orders (one per currency) mutation
export function useCreateMultiCurrencyOrders() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: Database.CreateMultiCurrencyOrdersData): Promise<Database.Order[]> => {
			const createdOrders: Database.Order[] = [];

			// Create one order per currency group
			for (const orderData of data.orders) {
				// Start a transaction-like operation for each order
				const { data: newOrder, error: orderError } = await supabase
					.from('orders')
					.insert({
						wallet_address: data.wallet_address,
						total_amount: orderData.total_amount,
						token_id: orderData.token_id,
						status: 'pending',
					})
					.select()
					.single();

				if (orderError) throw orderError;

				// Insert order items with price snapshot
				const orderItems = orderData.items.map(item => ({
					order_id: newOrder.id,
					product_id: item.product_id,
					quantity: item.quantity,
					price: item.price,
					token_id: item.token_id,
				}));

				const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

				if (itemsError) throw itemsError;

				createdOrders.push(newOrder);
			}

			return createdOrders;
		},
		onSuccess: () => {
			// Invalidate products cache for stock updates
			queryClient.invalidateQueries({ queryKey: ['products'] });
			queryClient.invalidateQueries({ queryKey: ['orders'] });
		},
	});
}
