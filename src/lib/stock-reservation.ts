import { supabase } from './supabase';

export interface StockReservation {
	id: string;
	order_id: string;
	product_id: string;
	quantity: number;
	reserved_at: string;
	expires_at: string;
	status: 'active' | 'confirmed' | 'expired' | 'released';
}

export interface StockReservationResult {
	success: boolean;
	reservation_id?: string;
	expires_at?: string;
	remaining_stock?: number;
	error?: string;
	available?: number;
	requested?: number;
}

export interface StockConfirmationResult {
	success: boolean;
	reservations_confirmed?: number;
	quantity_deducted?: number;
	error?: string;
}

export interface StockReleaseResult {
	success: boolean;
	reservations_released?: number;
	reason?: string;
	error?: string;
}

export interface BulkReservationResult {
	success: boolean;
	items_reserved?: number;
	successful?: number;
	failed?: number;
	details?: Array<{
		product_id: string;
		quantity: number;
		success: boolean;
	}>;
	error?: string;
}

export interface BulkValidationResult {
	success: boolean;
	message: string;
	items: Array<{
		product_id: string;
		required_quantity: number;
		has_sufficient_stock: boolean;
		available_stock: number | null;
		can_proceed: boolean;
		error?: string;
	}>;
	error?: string;
}

/**
 * Reserve stock for a single product and order
 * @param orderId The order ID to reserve stock for
 * @param productId The product ID to reserve
 * @param quantity The quantity to reserve
 * @param reservationMinutes Number of minutes for reservation (default: 30)
 */
export async function reserveStock(
	orderId: string,
	productId: string,
	quantity: number,
	reservationMinutes: number = 30,
): Promise<StockReservationResult> {
	try {
		const { data, error } = await supabase.rpc('reserve_stock', {
			p_order_id: orderId,
			p_product_id: productId,
			p_quantity: quantity,
			p_reservation_minutes: reservationMinutes,
		});

		if (error) {
			console.error('Stock reservation error:', error);
			return {
				success: false,
				error: error.message || 'Failed to reserve stock',
			};
		}

		const result = data as StockReservationResult;
		if (!result.success) {
			return {
				success: false,
				error: result.error || 'Stock reservation failed',
				available: result.available,
				requested: result.requested,
			};
		}

		return {
			success: true,
			reservation_id: result.reservation_id,
			expires_at: result.expires_at,
			remaining_stock: result.remaining_stock,
		};
	} catch (error) {
		console.error('Unexpected error in reserveStock:', error);
		return {
			success: false,
			error: 'Unexpected error occurred while reserving stock',
		};
	}
}

/**
 * Reserve stock for multiple products in a single order
 * @param orderId The order ID to reserve stock for
 * @param items Array of items with product_id and quantity
 */
export async function reserveBulkStock(
	orderId: string,
	items: Array<{ product_id: string; quantity: number }>,
): Promise<BulkReservationResult> {
	try {
		const { data, error } = await supabase.rpc('reserve_bulk_stock', {
			p_order_id: orderId,
			p_items: JSON.stringify(items),
		});

		if (error) {
			console.error('Bulk stock reservation error:', error);
			return {
				success: false,
				error: error.message || 'Failed to reserve stock for multiple items',
			};
		}

		const result = data as BulkReservationResult;
		if (!result.success) {
			return {
				success: false,
				error: result.error || 'Bulk stock reservation failed',
				successful: result.successful,
				failed: result.failed,
				details: result.details,
			};
		}

		return {
			success: true,
			items_reserved: result.items_reserved,
		};
	} catch (error) {
		console.error('Unexpected error in reserveBulkStock:', error);
		return {
			success: false,
			error: 'Unexpected error occurred while reserving stock',
		};
	}
}

/**
 * Confirm stock reservations when payment is successful
 * @param orderId The order ID whose reservations to confirm
 */
export async function confirmStockReservation(orderId: string): Promise<StockConfirmationResult> {
	try {
		const { data, error } = await supabase.rpc('confirm_stock_reservation', {
			p_order_id: orderId,
		});

		if (error) {
			console.error('Stock confirmation error:', error);
			return {
				success: false,
				error: error.message || 'Failed to confirm stock reservation',
			};
		}

		const result = data as StockConfirmationResult;
		if (!result.success) {
			return {
				success: false,
				error: result.error || 'Stock confirmation failed',
			};
		}

		return {
			success: true,
			reservations_confirmed: result.reservations_confirmed,
			quantity_deducted: result.quantity_deducted,
		};
	} catch (error) {
		console.error('Unexpected error in confirmStockReservation:', error);
		return {
			success: false,
			error: 'Unexpected error occurred while confirming stock reservation',
		};
	}
}

/**
 * Release stock reservations when payment fails or order is cancelled
 * @param orderId The order ID whose reservations to release
 * @param reason The reason for releasing the reservation
 */
export async function releaseStockReservation(
	orderId: string,
	reason: string = 'cancelled',
): Promise<StockReleaseResult> {
	try {
		const { data, error } = await supabase.rpc('release_stock_reservation', {
			p_order_id: orderId,
			p_reason: reason,
		});

		if (error) {
			console.error('Stock release error:', error);
			return {
				success: false,
				error: error.message || 'Failed to release stock reservation',
			};
		}

		const result = data as StockReleaseResult;
		if (!result.success) {
			return {
				success: false,
				error: result.error || 'Stock release failed',
			};
		}

		return {
			success: true,
			reservations_released: result.reservations_released,
			reason: result.reason,
		};
	} catch (error) {
		console.error('Unexpected error in releaseStockReservation:', error);
		return {
			success: false,
			error: 'Unexpected error occurred while releasing stock reservation',
		};
	}
}

/**
 * Get available stock for a product (considering active reservations)
 * @param productId The product ID to check
 */
export async function getAvailableStock(productId: string): Promise<number | null> {
	try {
		const { data, error } = await supabase.rpc('get_available_stock', {
			p_product_id: productId,
		});

		if (error) {
			console.error('Get available stock error:', error);
			return null;
		}

		return data as number;
	} catch (error) {
		console.error('Unexpected error in getAvailableStock:', error);
		return null;
	}
}

/**
 * Get active reservations for a product
 * @param productId The product ID to check
 */
export async function getActiveReservations(productId: string): Promise<StockReservation[]> {
	try {
		const { data, error } = await supabase
			.from('stock_reservations')
			.select('*')
			.eq('product_id', productId)
			.eq('status', 'active')
			.gt('expires_at', new Date().toISOString())
			.order('expires_at', { ascending: true });

		if (error) {
			console.error('Get active reservations error:', error);
			return [];
		}

		return (data || []) as StockReservation[];
	} catch (error) {
		console.error('Unexpected error in getActiveReservations:', error);
		return [];
	}
}

/**
 * Get reservations for an order
 * @param orderId The order ID to check
 */
export async function getOrderReservations(orderId: string): Promise<StockReservation[]> {
	try {
		const { data, error } = await supabase
			.from('stock_reservations')
			.select('*')
			.eq('order_id', orderId)
			.order('created_at', { ascending: true });

		if (error) {
			console.error('Get order reservations error:', error);
			return [];
		}

		return (data || []) as StockReservation[];
	} catch (error) {
		console.error('Unexpected error in getOrderReservations:', error);
		return [];
	}
}

/**
 * Check if a product has sufficient stock considering active reservations
 * @param productId The product ID to check
 * @param requiredQuantity The quantity needed
 */
export async function hasSufficientStock(productId: string, requiredQuantity: number): Promise<boolean> {
	const availableStock = await getAvailableStock(productId);

	if (availableStock === null) {
		return false; // Product doesn't exist or error occurred
	}

	return availableStock >= requiredQuantity;
}

/**
 * Validate stock for multiple products in a single database call (optimized)
 * @param items Array of items with product_id and quantity to validate
 */
export async function validateBulkStock(
	items: Array<{ product_id: string; quantity: number }>,
): Promise<BulkValidationResult> {
	try {
		const { data, error } = await supabase.rpc('validate_bulk_stock', {
			// p_items: JSON.stringify(items),
			p_items: items,
		});

		if (error) {
			console.error('Bulk stock validation error:', error);
			return {
				success: false,
				message: error.message || 'Failed to validate stock for multiple items',
				items: [],
				error: error.message,
			};
		}

		const result = data as BulkValidationResult;
		return {
			success: result.success,
			message: result.message,
			items: result.items || [],
			error: result.error,
		};
	} catch (error) {
		console.error('Unexpected error in validateBulkStock:', error);
		return {
			success: false,
			message: 'Unexpected error occurred while validating stock',
			items: [],
			error: 'Unexpected error occurred',
		};
	}
}

/**
 * Utility function to format reservation expiration time
 * @param expiresAt The expiration timestamp
 */
export function formatReservationExpiration(expiresAt: string): string {
	const expirationDate = new Date(expiresAt);
	const now = new Date();
	const diffMs = expirationDate.getTime() - now.getTime();
	const diffMins = Math.floor(diffMs / 60000);

	if (diffMins <= 0) {
		return 'Expired';
	}

	if (diffMins < 60) {
		return `${diffMins} minute${diffMins === 1 ? '' : 's'}`;
	}

	const hours = Math.floor(diffMins / 60);
	const minutes = diffMins % 60;

	if (hours < 24) {
		return `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}`;
	}

	const days = Math.floor(hours / 24);
	const remainingHours = hours % 24;

	return `${days} day${days === 1 ? '' : 's'} ${remainingHours} hour${remainingHours === 1 ? '' : 's'}`;
}

/**
 * Check if a reservation is expired
 * @param expiresAt The expiration timestamp
 */
export function isReservationExpired(expiresAt: string): boolean {
	const expirationDate = new Date(expiresAt);
	const now = new Date();
	return expirationDate <= now;
}
