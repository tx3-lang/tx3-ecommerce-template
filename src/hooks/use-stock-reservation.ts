import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Lib
import {
	confirmStockReservation,
	formatReservationExpiration,
	getActiveReservations,
	getAvailableStock,
	getOrderReservations,
	hasSufficientStock,
	isReservationExpired,
	releaseStockReservation,
	reserveBulkStock,
	reserveStock,
} from '@/lib/stock-reservation';

// Types for the hooks
interface ReserveStockParams {
	orderId: string;
	productId: string;
	quantity: number;
	reservationMinutes?: number;
}

interface ReserveBulkStockParams {
	orderId: string;
	items: Array<{ product_id: string; quantity: number }>;
}

interface ConfirmReservationParams {
	orderId: string;
}

interface ReleaseReservationParams {
	orderId: string;
	reason?: string;
}

/**
 * Hook to reserve stock for a single product
 */
export function useReserveStock() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ orderId, productId, quantity, reservationMinutes = 30 }: ReserveStockParams) =>
			reserveStock(orderId, productId, quantity, reservationMinutes),
		onSuccess: (_, variables) => {
			// Invalidate related queries
			queryClient.invalidateQueries({ queryKey: ['available-stock', variables.productId] });
			queryClient.invalidateQueries({ queryKey: ['active-reservations', variables.productId] });
			queryClient.invalidateQueries({ queryKey: ['order-reservations', variables.orderId] });
			queryClient.invalidateQueries({ queryKey: ['products'] });
		},
		onError: error => {
			console.error('Stock reservation failed:', error);
		},
	});
}

/**
 * Hook to reserve stock for multiple products in a single order
 */
export function useReserveBulkStock() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ orderId, items }: ReserveBulkStockParams) => reserveBulkStock(orderId, items),
		onSuccess: (_, variables) => {
			// Invalidate related queries for all products
			const productIds = variables.items.map(item => item.product_id);

			queryClient.invalidateQueries({ queryKey: ['products'] });
			productIds.forEach(productId => {
				queryClient.invalidateQueries({ queryKey: ['available-stock', productId] });
				queryClient.invalidateQueries({ queryKey: ['active-reservations', productId] });
			});
			queryClient.invalidateQueries({ queryKey: ['order-reservations', variables.orderId] });
		},
		onError: error => {
			console.error('Bulk stock reservation failed:', error);
		},
	});
}

/**
 * Hook to confirm stock reservations when payment is successful
 */
export function useConfirmStockReservation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ orderId }: ConfirmReservationParams) => confirmStockReservation(orderId),
		onSuccess: (_, variables) => {
			// Invalidate related queries
			queryClient.invalidateQueries({ queryKey: ['order-reservations', variables.orderId] });
			queryClient.invalidateQueries({ queryKey: ['orders', variables.orderId] });
			queryClient.invalidateQueries({ queryKey: ['products'] });

			// Invalidate all available stock queries since stock might have changed
			queryClient.invalidateQueries({ queryKey: ['available-stock'] });
		},
		onError: error => {
			console.error('Stock confirmation failed:', error);
		},
	});
}

/**
 * Hook to release stock reservations when payment fails or order is cancelled
 */
export function useReleaseStockReservation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ orderId, reason }: ReleaseReservationParams) => releaseStockReservation(orderId, reason),
		onSuccess: (_, variables) => {
			// Invalidate related queries
			queryClient.invalidateQueries({ queryKey: ['order-reservations', variables.orderId] });
			queryClient.invalidateQueries({ queryKey: ['orders', variables.orderId] });
			queryClient.invalidateQueries({ queryKey: ['products'] });

			// Invalidate all available stock queries since stock might have changed
			queryClient.invalidateQueries({ queryKey: ['available-stock'] });
		},
		onError: error => {
			console.error('Stock release failed:', error);
		},
	});
}

/**
 * Hook to get available stock for a product
 */
export function useAvailableStock(productId?: string) {
	return useQuery({
		queryKey: ['available-stock', productId],
		queryFn: () => (productId ? getAvailableStock(productId) : null),
		enabled: !!productId,
		staleTime: 30 * 1000, // 30 seconds
		select: data => {
			// Transform the data to handle null cases
			return data;
		},
	});
}

/**
 * Hook to get active reservations for a product
 */
export function useActiveReservations(productId?: string) {
	return useQuery({
		queryKey: ['active-reservations', productId],
		queryFn: () => (productId ? getActiveReservations(productId) : []),
		enabled: !!productId,
		staleTime: 15 * 1000, // 15 seconds
		select: reservations => {
			// Add computed properties to each reservation
			return reservations.map(reservation => ({
				...reservation,
				timeRemaining: formatReservationExpiration(reservation.expires_at),
				isExpired: isReservationExpired(reservation.expires_at),
			}));
		},
	});
}

/**
 * Hook to get reservations for a specific order
 */
export function useOrderReservations(orderId?: string) {
	return useQuery({
		queryKey: ['order-reservations', orderId],
		queryFn: () => (orderId ? getOrderReservations(orderId) : []),
		enabled: !!orderId,
		staleTime: 30 * 1000, // 30 seconds
		select: reservations => {
			// Add computed properties to each reservation
			return reservations.map(reservation => ({
				...reservation,
				timeRemaining: formatReservationExpiration(reservation.expires_at),
				isExpired: isReservationExpired(reservation.expires_at),
			}));
		},
	});
}

/**
 * Hook to check if a product has sufficient stock
 */
export function useHasSufficientStock(productId?: string, requiredQuantity?: number) {
	return useQuery({
		queryKey: ['sufficient-stock', productId, requiredQuantity],
		queryFn: async () => {
			if (!productId || requiredQuantity === undefined) return false;
			return hasSufficientStock(productId, requiredQuantity);
		},
		enabled: !!productId && requiredQuantity !== undefined,
		staleTime: 30 * 1000, // 30 seconds
	});
}

/**
 * Hook to validate stock for cart items before checkout (legacy - use useValidateBulkStock for better performance)
 */
export function useValidateCartStock() {
	return useMutation({
		mutationFn: async (cartItems: Array<{ product_id: string; quantity: number }>) => {
			const validationResults = await Promise.all(
				cartItems.map(async item => {
					// Optimized: only call getAvailableStock once (hasSufficientStock calls it internally)
					const availableStock = await getAvailableStock(item.product_id);
					const hasStock = availableStock !== null && availableStock >= item.quantity;

					return {
						product_id: item.product_id,
						required_quantity: item.quantity,
						has_sufficient_stock: hasStock,
						available_stock: availableStock,
						can_proceed: hasStock,
					};
				}),
			);

			const allItemsHaveStock = validationResults.every(result => result.can_proceed);

			return {
				success: allItemsHaveStock,
				items: validationResults,
				message: allItemsHaveStock ? 'All items have sufficient stock' : 'Some items have insufficient stock',
			};
		},
		onError: error => {
			console.error('Cart stock validation failed:', error);
		},
	});
}

/**
 * Hook to monitor reservation expiration and handle auto-cleanup
 */
export function useReservationMonitor(orderId?: string, enabled: boolean = false) {
	const reservationsQuery = useOrderReservations(orderId);

	return useQuery({
		queryKey: ['reservation-monitor', orderId],
		queryFn: async () => {
			if (!orderId || !reservationsQuery.data) return null;

			const activeReservations = reservationsQuery.data.filter(
				reservation => reservation.status === 'active' && !reservation.isExpired,
			);

			// Check if any reservations are about to expire (within 5 minutes)
			const nearExpiration = activeReservations.filter(reservation => {
				const timeUntilExpiration = new Date(reservation.expires_at).getTime() - Date.now();
				return timeUntilExpiration > 0 && timeUntilExpiration <= 5 * 60 * 1000; // 5 minutes
			});

			// Check if any reservations are expired
			const expired = activeReservations.filter(reservation => reservation.isExpired);

			return {
				active_reservations: activeReservations.length,
				near_expiration: nearExpiration.length,
				expired_reservations: expired.length,
				needs_cleanup: expired.length > 0,
			};
		},
		enabled: enabled && !!orderId && !!reservationsQuery.data,
		staleTime: 10 * 1000, // 10 seconds
		refetchInterval: 30 * 1000, // Check every 30 seconds
	});
}

/**
 * Utility hook to get stock status with loading and error states
 */
export function useStockStatus(productId?: string) {
	const availableStockQuery = useAvailableStock(productId);
	const activeReservationsQuery = useActiveReservations(productId);

	return {
		availableStock: availableStockQuery.data,
		activeReservations: activeReservationsQuery.data,
		isLoading: availableStockQuery.isLoading || activeReservationsQuery.isLoading,
		isError: availableStockQuery.isError || activeReservationsQuery.isError,
		error: availableStockQuery.error || activeReservationsQuery.error,
		refetch: () => {
			availableStockQuery.refetch();
			activeReservationsQuery.refetch();
		},
	};
}

/**
 * Hook to calculate reservation expiration warnings
 */
export function useReservationWarnings(orderId?: string) {
	const reservationsQuery = useOrderReservations(orderId);

	return {
		warnings:
			reservationsQuery.data?.filter(reservation => {
				if (reservation.status !== 'active') return false;

				const timeUntilExpiration = new Date(reservation.expires_at).getTime() - Date.now();
				return timeUntilExpiration > 0 && timeUntilExpiration <= 5 * 60 * 1000; // 5 minutes
			}) || [],
		expired:
			reservationsQuery.data?.filter(reservation => reservation.status === 'active' && reservation.isExpired) || [],
		isLoading: reservationsQuery.isLoading,
		refetch: reservationsQuery.refetch,
	};
}
