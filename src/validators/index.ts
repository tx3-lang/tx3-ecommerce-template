import { z } from 'zod';
import { constants } from '@/constants';

export const productSchema = z.object({
	name: z.string().min(1, 'Product name is required'),
	description: z.string().optional(),
	price_lovelace: z.number().min(0, 'Price must be non-negative'),
	stock: z.number().int().min(0, 'Stock must be non-negative'),
	is_active: z.boolean().default(true),
});

export const orderItemSchema = z.object({
	product_id: z.string().uuid('Invalid product ID'),
	quantity: z.number().int().min(1, 'Quantity must be at least 1'),
	token_policy_id: z.string().optional(),
	token_asset_name: z.string().optional(),
});

export const createOrderSchema = z.object({
	items: z.array(orderItemSchema).min(1, 'At least one item is required'),
	customer_email: z.string().email('Invalid email address').optional(),
});

export const paymentRequestSchema = z.object({
	amount_lovelace: z.number().positive('Amount must be positive'),
	token_policy_id: z.string().optional(),
	token_asset_name: z.string().optional(),
	recipient_address: z.string().regex(constants.VALIDATION.WALLET_ADDRESS_REGEX, 'Invalid wallet address'),
});
