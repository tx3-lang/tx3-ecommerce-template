import { getTokenMetadataById, isTokenSupported } from './index';
import { supabase } from './supabase';

export async function createOrderWithStockReservation(
	data: Database.CreateOrderData,
): Promise<{ success: boolean; order?: Database.Order; error?: string }> {
	try {
		// Step 1: Validate all tokens exist in supported_tokens
		const tokenIdsToValidate = [data.token_id, ...data.items.map(item => item.token_id).filter(Boolean)];

		const uniqueTokenIds = [...new Set(tokenIdsToValidate)];

		for (const tokenId of uniqueTokenIds) {
			if (tokenId) {
				// Skip null values (ADA)
				const isSupported = await isTokenSupported(tokenId);
				if (!isSupported) {
					throw new Error(`Token ${tokenId} is not supported for payments`);
				}

				const tokenMetadata = await getTokenMetadataById(tokenId);
				if (!tokenMetadata) {
					throw new Error(`Token metadata not found for ${tokenId}`);
				}

				if (!tokenMetadata.is_active) {
					throw new Error(`Token ${tokenId} is not active`);
				}
			}
		}

		// Step 2: Create order
		const { data: orderData, error: orderError } = await supabase
			.from('orders')
			.insert({
				wallet_address: data.wallet_address,
				total_amount: data.total_amount,
				token_id: data.token_id,
				status: 'pending',
			})
			.select(`
				*,
				supported_tokens (policy_id, asset_name, display_name, decimals)
			`)
			.single();

		if (orderError) {
			throw new Error(`Failed to create order: ${orderError.message}`);
		}

		// Step 3: Create order items
		const orderItems = data.items.map(item => ({
			order_id: orderData.id,
			product_id: item.product_id,
			quantity: item.quantity,
			price: item.price,
			token_id: item.token_id,
		}));

		const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

		if (itemsError) {
			// Rollback order creation
			await supabase.from('orders').delete().eq('id', orderData.id);
			throw new Error(`Failed to create order items: ${itemsError.message}`);
		}

		return {
			success: true,
			order: orderData,
		};
	} catch (error) {
		console.error('Order creation error:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

		// Handle specific token-related errors
		if (errorMessage.includes('Token') && errorMessage.includes('not supported')) {
			return {
				success: false,
				error: 'Invalid payment token used in order',
			};
		}

		if (errorMessage.includes('Token metadata')) {
			return {
				success: false,
				error: 'Token configuration error. Please contact support.',
			};
		}

		if (errorMessage.includes('not active')) {
			return {
				success: false,
				error: 'Selected token is temporarily unavailable. Please try again later.',
			};
		}

		return {
			success: false,
			error: errorMessage,
		};
	}
}

export async function updateOrderStatus(
	orderId: string,
	status: Database.OrderStatus,
	txHash?: string,
	error?: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const updateData: Partial<Database.Order> = { status };

		if (txHash) {
			updateData.cardano_tx_hash = txHash;
		}

		if (error) {
			updateData.payment_error = error;
		}
		console.log(updateData);

		const { error: updateError } = await supabase.from('orders').update(updateData).eq('id', orderId);

		console.log('order updated');

		if (updateError) {
			throw new Error(`Failed to update order: ${updateError.message}`);
		}

		// Stock reservations are handled automatically by database triggers
		if (status === 'paid') {
			console.log('Order paid, stock reservation confirmed automatically');
		} else if (status === 'payment_failed' || status === 'cancelled') {
			console.log('Order failed/cancelled, stock reservation released automatically');
		}

		return { success: true };
	} catch (error) {
		console.error('Error updating order status:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}
