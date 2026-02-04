import { useMutation, useQueryClient } from '@tanstack/react-query';

// Server function
import { createMultiCurrencyOrdersServerFn } from '@/server-fns/orders';

// Create multiple orders (one per currency) mutation
export function useCreateMultiCurrencyOrders() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: {
			wallet_address: string;
			orders: Array<{
				items: Database.OrderItemInput[];
				token_id?: string | null;
			}>;
		}): Promise<Database.Order[]> => {
			// Call server function instead of direct Supabase insert
			// This ensures proper validation, RLS handling with service role, and atomic transactions
			const result = await createMultiCurrencyOrdersServerFn({ data });

			if (!result.success) {
				throw new Error(result.error || 'Failed to create orders');
			}

			return result.orders || [];
		},
		onSuccess: () => {
			// Invalidate products cache for stock updates
			queryClient.invalidateQueries({ queryKey: ['products'] });
			queryClient.invalidateQueries({ queryKey: ['orders'] });
		},
	});
}
