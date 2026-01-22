// Lib
import type { CartItem } from '@/lib/cart-storage';
import { supabase } from '@/lib/supabase';

export interface StockValidation {
	productId: string;
	currentStock: number;
}

export async function validateCartStock(items: CartItem[]): Promise<StockValidation[]> {
	if (items.length === 0) return [];

	const productIds = items.map(item => item.productId);

	const { data: products, error } = await supabase
		.from('products')
		.select('id, name, stock, is_active')
		.in('id', productIds)
		.is('deleted_at', null);

	if (error) {
		console.error('Stock validation error:', error);
		// Return optimistic validation (assume in stock)
		return items.map(item => ({
			productId: item.productId,
			currentStock: item.product.stock,
		}));
	}

	const productMap = new Map(products?.map(p => [p.id, p]) || []);

	return items.map(item => {
		const product = productMap.get(item.productId);
		if (!product || !product.is_active) {
			return {
				productId: item.productId,
				currentStock: 0,
			};
		}

		return {
			productId: item.productId,
			currentStock: product.stock,
		};
	});
}
