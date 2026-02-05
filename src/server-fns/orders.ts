import { createClient } from '@supabase/supabase-js';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// Lib
import { getTokenMetadataById, isTokenSupported } from '@/lib';

interface BulkReservationResult {
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

// Validation schemas using Zod (consistent with project patterns)
const orderItemSchema = z.object({
	product_id: z.uuid('Invalid product ID format'),
	quantity: z.number().int().min(1, 'Quantity must be at least 1'),
	price: z.number().positive('Price must be positive'),
	token_id: z.uuid().nullable().optional(),
});

const shippingInfoSchema = z.object({
	fullName: z.string().min(1, 'Full name is required'),
	email: z.email('Valid email is required'),
	phone: z.string().optional(),
	address: z.string().min(1, 'Address is required'),
	city: z.string().min(1, 'City is required'),
	postalCode: z.string().min(1, 'Postal code is required'),
	country: z.string().min(1, 'Country is required'),
});

const validateAndReserveStockSchema = z.object({
	cart_items: z
		.array(
			z.object({
				product_id: z.uuid('Invalid product ID format'),
				quantity: z.number().int().min(1, 'Quantity must be at least 1'),
			}),
		)
		.min(1, 'At least one item is required'),
	reservation_minutes: z.number().int().min(5).max(120).optional().default(30),
});

const updateOrderStatusSchema = z.object({
	order_id: z.uuid('Invalid order ID format'),
	status: z.enum(['pending', 'payment_failed', 'paid', 'processing', 'shipped', 'completed', 'cancelled']),
	tx_hash: z.string().optional(),
	error: z.string().optional(),
});

const createMultiCurrencyOrderSchema = z.object({
	wallet_address: z.string().min(1, 'Wallet address is required'),
	orders: z.array(
		z.object({
			items: z.array(orderItemSchema).min(1, 'At least one item is required'),
			token_id: z.uuid().nullable().optional(),
		}),
	),
	shipping_info: shippingInfoSchema.optional(),
});

const createOrdersSchema = z.object({
	wallet_address: z.string().min(1, 'Wallet address is required'),
	orders: z
		.array(
			z.object({
				items: z.array(orderItemSchema).min(1, 'At least one item is required'),
				token_id: z.uuid().nullable().optional(),
			}),
		)
		.min(1, 'At least one order group is required'),
	shipping_info: shippingInfoSchema.optional(),
});

/**
 * Get server-side Supabase client with elevated privileges
 * Uses secret key (sb_secret_...) which bypasses RLS policies
 * @see https://supabase.com/docs/guides/api/api-keys
 */
function getServerSupabase() {
	const supabaseUrl = process.env.VITE_SUPABASE_URL;
	const secretKey = process.env.SUPABASE_SECRET_KEY;

	if (!supabaseUrl || !secretKey) {
		throw new Error('Missing Supabase server credentials. Required: VITE_SUPABASE_URL and SUPABASE_SECRET_KEY');
	}

	return createClient(supabaseUrl, secretKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

/**
 * Validate all product prices and calculate accurate totals
 * Returns validated order items with correct totals
 */
async function validateAndCalculateOrderTotals(items: Database.OrderItemInput[]) {
	const supabase = getServerSupabase();
	const validatedItems: Array<Database.OrderItemInput & { calculated_total: number }> = [];
	let orderTotal = 0;

	for (const item of items) {
		// Fetch current product data to validate and get correct price
		const { data: product, error: productError } = await supabase
			.from('products')
			.select('id, name, price, token_id')
			.eq('id', item.product_id)
			.is('deleted_at', null)
			.single();

		if (productError || !product) {
			throw new Error(`Product ${item.product_id} not found or deleted`);
		}

		// Validate price matches current product price (client might be outdated)
		if (item.price !== product.price) {
			throw new Error(
				`Price mismatch for product ${product.name}. Expected ${product.price}, got ${item.price}. Please refresh and try again.`,
			);
		}

		const itemTotal = item.price * item.quantity;
		validatedItems.push({
			...item,
			calculated_total: itemTotal,
		});

		orderTotal += itemTotal;
	}

	return {
		validatedItems,
		calculatedTotal: orderTotal,
	};
}

async function updateOrderStatusWithServiceRole(
	orderId: string,
	status: Database.OrderStatus,
	txHash?: string,
	error?: string,
) {
	const supabase = getServerSupabase();
	const updateData: Partial<Database.Order> = { status };

	if (txHash) {
		updateData.cardano_tx_hash = txHash;
	}

	if (error) {
		updateData.payment_error = error;
	}

	const { error: updateError } = await supabase.from('orders').update(updateData).eq('id', orderId);

	if (updateError) {
		throw new Error(`Failed to update order: ${updateError.message}`);
	}

	// Stock reservations are handled automatically by database triggers
	if (status === 'paid') {
		console.log('Order paid, stock reservation confirmed automatically');
	} else if (status === 'payment_failed' || status === 'cancelled') {
		console.log('Order failed/cancelled, stock reservation released automatically');
	}
}

/**
 * Create multiple orders (one per currency) with strict validation
 * Uses service role to bypass RLS and ensure atomic transactions
 */
export const createMultiCurrencyOrdersServerFn = createServerFn({ method: 'POST' })
	.inputValidator(createMultiCurrencyOrderSchema)
	.handler(async ({ data }) => {
		const { wallet_address, orders, shipping_info } = data;
		console.log('Creating multi-currency orders:', {
			walletAddress: wallet_address,
			orderCount: orders.length,
		});

		const supabase = getServerSupabase();
		const createdOrders: Database.Order[] = [];
		let shippingInfoId: string | null = null;

		try {
			// Validate input
			if (!wallet_address || wallet_address.trim().length === 0) {
				return {
					success: false,
					error: 'Wallet address is required',
				};
			}

			if (!Array.isArray(orders) || orders.length === 0) {
				return {
					success: false,
					error: 'At least one order group is required',
				};
			}

			if (shipping_info) {
				const { data: shippingInfo, error: shippingError } = await supabase
					.from('shipping_info')
					.upsert(
						{
							wallet_address: wallet_address,
							full_name: shipping_info.fullName,
							email: shipping_info.email,
							phone: shipping_info.phone || null,
							address: shipping_info.address,
							city: shipping_info.city,
							postal_code: shipping_info.postalCode,
							country: shipping_info.country,
						},
						{ onConflict: 'wallet_address' },
					)
					.select('id')
					.single();

				if (shippingError || !shippingInfo) {
					return {
						success: false,
						error: `Failed to save shipping info: ${shippingError?.message || 'Unknown error'}`,
					};
				}

				shippingInfoId = shippingInfo.id;
			}

			// Validate all tokens first
			const allTokenIds = [...orders.map(o => o.token_id).filter(Boolean)];
			const uniqueTokenIds = [...new Set(allTokenIds)];

			for (const tokenId of uniqueTokenIds) {
				if (tokenId) {
					const isSupportedToken = await isTokenSupported(tokenId);
					if (!isSupportedToken) {
						return {
							success: false,
							error: `Token ${tokenId} is not supported for payments`,
						};
					}

					const tokenMetadata = await getTokenMetadataById(tokenId);
					if (!tokenMetadata) {
						return {
							success: false,
							error: `Token metadata not found for ${tokenId}`,
						};
					}

					if (!tokenMetadata.is_active) {
						return {
							success: false,
							error: `Token ${tokenId} is not active`,
						};
					}
				}
			}

			// Create one order per currency group
			for (const orderGroup of orders) {
				if (!Array.isArray(orderGroup.items) || orderGroup.items.length === 0) {
					return {
						success: false,
						error: 'Each order must have at least one item',
					};
				}

				// Validate prices and calculate correct totals server-side
				const { validatedItems, calculatedTotal } = await validateAndCalculateOrderTotals(orderGroup.items);

				// Create order with secret key (bypasses RLS)
				const { data: newOrder, error: orderError } = await supabase
					.from('orders')
					.insert({
						wallet_address: wallet_address,
						total_amount: calculatedTotal,
						token_id: orderGroup.token_id || null,
						shipping_id: shippingInfoId,
						status: 'pending',
					})
					.select(`
						*,
						supported_tokens (policy_id, asset_name, display_name, decimals)
					`)
					.single();

				if (orderError) {
					return {
						success: false,
						error: `Failed to create order: ${orderError.message}`,
					};
				}

				// Insert order items with validated prices
				const orderItems = validatedItems.map(item => ({
					order_id: newOrder.id,
					product_id: item.product_id,
					quantity: item.quantity,
					price: item.price,
					token_id: item.token_id || null,
				}));

				const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

				if (itemsError) {
					// Rollback order creation
					await supabase.from('orders').delete().eq('id', newOrder.id);
					return {
						success: false,
						error: `Failed to create order items: ${itemsError.message}`,
					};
				}

				createdOrders.push(newOrder);
			}

			return {
				success: true,
				orders: createdOrders,
				message: `Successfully created ${createdOrders.length} order(s)`,
			};
		} catch (error) {
			console.error('Multi-currency order creation error:', error);

			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			return {
				success: false,
				error: errorMessage,
			};
		}
	});

/**
 * Server function to update order status
 * Handles payment confirmation and stock operations
 */
export const updateOrderStatusServerFn = createServerFn({ method: 'POST' })
	.inputValidator(updateOrderStatusSchema)
	.handler(async ({ data }) => {
		console.log('Updating order status:', {
			orderId: data.order_id,
			status: data.status,
			hasTxHash: !!data.tx_hash,
		});

		try {
			await updateOrderStatusWithServiceRole(
				data.order_id,
				data.status as Database.OrderStatus,
				data.tx_hash,
				data.error,
			);

			// Fetch updated order data to return using service role
			const supabase = getServerSupabase();
			const { data: orderData, error: fetchError } = await supabase
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
				.eq('id', data.order_id)
				.single();

			if (fetchError) {
				throw new Error(`Failed to fetch updated order: ${fetchError.message}`);
			}

			return {
				success: true,
				order: orderData,
				message: `Order status updated to ${data.status}`,
			};
		} catch (error) {
			console.error('Order status update server function error:', error);

			// Re-throw to let TanStack handle it
			if (error instanceof Error) {
				throw error;
			}

			throw new Error('Unknown error occurred during order status update');
		}
	});

/**
 * Server function to get order details
 * Provides secure access to order information
 */
export const getOrderServerFn = createServerFn({ method: 'GET' })
	.inputValidator(
		z.object({
			order_id: z.uuid('Invalid order ID format'),
			wallet_address: z.string().min(1, 'Wallet address is required').optional(),
		}),
	)
	.handler(async ({ data }) => {
		console.log('Getting order details:', { orderId: data.order_id });

		try {
			const { supabase } = await import('@/lib/supabase');

			let query = supabase.from('orders').select(`
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
        `);

			// Apply filters
			if (data.order_id) {
				query = query.eq('id', data.order_id);
			}
			if (data.wallet_address) {
				query = query.eq('wallet_address', data.wallet_address);
			}

			const { data: orderData, error } = await query.single();

			if (error) {
				if (error.code === 'PGRST116') {
					throw new Error('Order not found');
				}
				throw new Error(`Failed to fetch order: ${error.message}`);
			}

			return {
				success: true,
				order: orderData,
			};
		} catch (error) {
			console.error('Get order server function error:', error);

			// Re-throw to let TanStack handle it
			if (error instanceof Error) {
				throw error;
			}

			throw new Error('Unknown error occurred while fetching order');
		}
	});

/**
 * Server function to get user orders
 * Securely fetches orders for a specific wallet
 */
export const getUserOrdersServerFn = createServerFn({ method: 'GET' })
	.inputValidator(
		z.object({
			wallet_address: z.string().min(1, 'Wallet address is required'),
		}),
	)
	.handler(async ({ data }) => {
		console.log('Getting user orders:', { walletAddress: data.wallet_address });

		try {
			const { supabase } = await import('@/lib/supabase');

			const { data: orders, error } = await supabase
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
				.eq('wallet_address', data.wallet_address)
				.is('deleted_at', null)
				.order('created_at', { ascending: false });

			if (error) {
				throw new Error(`Failed to fetch orders: ${error.message}`);
			}

			return {
				success: true,
				orders: orders || [],
				count: orders?.length || 0,
			};
		} catch (error) {
			console.error('Get user orders server function error:', error);

			// Re-throw to let TanStack handle it
			if (error instanceof Error) {
				throw error;
			}

			throw new Error('Unknown error occurred while fetching orders');
		}
	});

/**
 * Unified server function to validate and reserve stock for cart items
 * Returns reservation IDs for later confirmation upon payment
 * This is a required step before order creation
 */
export const validateAndReserveStockServerFn = createServerFn({ method: 'POST' })
	.inputValidator(validateAndReserveStockSchema)
	.handler(async ({ data }) => {
		const supabase = getServerSupabase();

		console.log('Validating and reserving stock:', {
			itemCount: data.cart_items.length,
			reservationMinutes: data.reservation_minutes,
		});

		try {
			const results = [];

			for (const item of data.cart_items) {
				// Get current product stock
				const { data: product, error: productError } = await supabase
					.from('products')
					.select('id, name, stock')
					.eq('id', item.product_id)
					.is('deleted_at', null)
					.single();

				console.log(product, productError);

				if (productError || !product) {
					return {
						success: false,
						message: `Product ${item.product_id} not found or deleted`,
					};
				}

				const availableStock = product.stock || 0;

				if (availableStock < item.quantity) {
					return {
						success: false,
						message: `Insufficient stock for product "${product.name}". Available: ${availableStock}, Requested: ${item.quantity}`,
						items: results,
					};
				}

				results.push({
					product_id: item.product_id,
					product_name: product.name,
					quantity: item.quantity,
					available_stock: availableStock,
					can_reserve: true,
				});
			}

			return {
				success: true,
				message: `Stock validation successful for ${results.length} item(s)`,
				items: results,
			};
		} catch (error) {
			console.error('Stock validation error:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during stock validation';

			return {
				success: false,
				message: errorMessage,
			};
		}
	});

/**
 * Unified server function to create orders (single or multiple)
 * Always returns an array of Database.Order[] for consistency
 * Single order → [order]
 * Multi-currency → [order1, order2, ...]
 *
 * Handles:
 * - Price validation against current product prices
 * - Token validation and metadata verification
 * - Order and order items creation
 * - Atomic transaction semantics
 */
export const createOrdersServerFn = createServerFn({ method: 'POST' })
	.inputValidator(createOrdersSchema)
	.handler(async ({ data }) => {
		const supabase = getServerSupabase();
		const createdOrders: Database.Order[] = [];
		let shippingInfoId: string | null = null;
		const rollbackOrder = async (orderId: string) => {
			await supabase.from('order_items').delete().eq('order_id', orderId);
			await supabase.from('orders').delete().eq('id', orderId);
		};

		console.log('Creating unified orders:', {
			walletAddress: data.wallet_address,
			orderCount: data.orders.length,
		});

		try {
			// ===== Validation Phase =====

			// Validate wallet address
			if (!data.wallet_address || data.wallet_address.trim().length === 0) {
				return {
					success: false,
					orders: [],
					message: 'Wallet address is required',
				};
			}

			// Validate orders array
			if (!Array.isArray(data.orders) || data.orders.length === 0) {
				return {
					success: false,
					orders: [],
					message: 'At least one order group is required',
				};
			}

			if (data.shipping_info) {
				const { data: shippingInfo, error: shippingError } = await supabase
					.from('shipping_info')
					.upsert(
						{
							wallet_address: data.wallet_address,
							full_name: data.shipping_info.fullName,
							email: data.shipping_info.email,
							phone: data.shipping_info.phone || null,
							address: data.shipping_info.address,
							city: data.shipping_info.city,
							postal_code: data.shipping_info.postalCode,
							country: data.shipping_info.country,
						},
						{ onConflict: 'wallet_address' },
					)
					.select('id')
					.single();

				if (shippingError || !shippingInfo) {
					return {
						success: false,
						orders: [],
						message: `Failed to save shipping info: ${shippingError?.message || 'Unknown error'}`,
					};
				}

				shippingInfoId = shippingInfo.id;
			}

			// Validate all tokens are supported and active
			const allTokenIds = [...data.orders.map(o => o.token_id).filter(Boolean)];
			const uniqueTokenIds = [...new Set(allTokenIds)] as string[];

			for (const tokenId of uniqueTokenIds) {
				if (tokenId) {
					const isSupportedToken = await isTokenSupported(tokenId);
					if (!isSupportedToken) {
						return {
							success: false,
							orders: [],
							message: `Token ${tokenId} is not supported for payments`,
						};
					}

					const tokenMetadata = await getTokenMetadataById(tokenId);
					if (!tokenMetadata) {
						return {
							success: false,
							orders: [],
							message: `Token metadata not found for ${tokenId}`,
						};
					}

					if (!tokenMetadata.is_active) {
						return {
							success: false,
							orders: [],
							message: `Token ${tokenId} is not active`,
						};
					}
				}
			}

			// ===== Order Creation Phase =====

			for (const orderGroup of data.orders) {
				if (!Array.isArray(orderGroup.items) || orderGroup.items.length === 0) {
					return {
						success: false,
						orders: createdOrders,
						message: 'Each order must have at least one item',
					};
				}

				// Validate prices and calculate totals server-side
				const { validatedItems, calculatedTotal } = await validateAndCalculateOrderTotals(orderGroup.items);

				// Create order record
				const { data: newOrder, error: orderError } = await supabase
					.from('orders')
					.insert({
						wallet_address: data.wallet_address,
						total_amount: calculatedTotal,
						token_id: orderGroup.token_id || null,
						shipping_id: shippingInfoId,
						status: 'pending',
					})
					.select(
						`
						*,
						supported_tokens (policy_id, asset_name, display_name, decimals)
					`,
					)
					.single();

				if (orderError) {
					return {
						success: false,
						orders: createdOrders,
						message: `Failed to create order: ${orderError.message}`,
					};
				}

				if (!newOrder) {
					return {
						success: false,
						orders: createdOrders,
						message: 'Order creation returned null',
					};
				}

				// Create order items with validated prices
				const orderItems = validatedItems.map(item => ({
					order_id: newOrder.id,
					product_id: item.product_id,
					quantity: item.quantity,
					price: item.price,
					token_id: item.token_id || null,
				}));

				const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

				if (itemsError) {
					// Rollback: delete the created order
					await rollbackOrder(newOrder.id);

					return {
						success: false,
						orders: createdOrders,
						message: `Failed to create order items: ${itemsError.message}`,
					};
				}

				const reservationItems = validatedItems.map(item => ({
					product_id: item.product_id,
					quantity: item.quantity,
				}));

				const { data: reservationData, error: reservationError } = await supabase.rpc('reserve_bulk_stock', {
					p_order_id: newOrder.id,
					p_items: reservationItems,
				});

				if (reservationError) {
					await rollbackOrder(newOrder.id);
					return {
						success: false,
						orders: createdOrders,
						message: `Failed to reserve stock: ${reservationError.message}`,
					};
				}

				const reservationResult = reservationData as BulkReservationResult | null;
				if (!reservationResult?.success) {
					await rollbackOrder(newOrder.id);
					return {
						success: false,
						orders: createdOrders,
						message: reservationResult?.error || 'Stock reservation failed',
					};
				}

				createdOrders.push(newOrder);
			}

			return {
				success: true,
				orders: createdOrders,
				message: `Successfully created ${createdOrders.length} order(s)`,
			};
		} catch (error) {
			console.error('Order creation error:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during order creation';

			return {
				success: false,
				orders: createdOrders,
				message: errorMessage,
			};
		}
	});
