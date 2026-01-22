import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

// Hooks
import { useCart } from '@/hooks/use-cart';

// Lib
import type { CartItem as CartItemType } from '@/lib/cart-storage';
import { type StockValidation, validateCartStock } from '@/lib/stock-validation';

export interface CartItemWithStock extends CartItemType {
	stockInfo?: StockValidation;
	hasStockIssue: boolean;
}

export interface UseCartItemsOptions {
	onMissingStock?: (hasIssues: boolean) => void;
	enableStockValidation?: boolean;
}

export function useCartItems(options: UseCartItemsOptions = {}) {
	const { items, updateProductStock } = useCart();
	const { onMissingStock, enableStockValidation = true } = options;

	// Memoize the query key to prevent unnecessary re-renders
	const stockValidationQueryKey = useMemo(() => items.map(i => `${i.productId}`), [items]);

	// Validate stock in real-time
	const { data: stockValidation = [], isLoading: isValidatingStock } = useQuery({
		queryKey: ['stock-validation', stockValidationQueryKey],
		queryFn: () => validateCartStock(items),
		enabled: enableStockValidation && items.length > 0,
		staleTime: 30000, // 30 seconds
	});

	// Memoize expensive calculations
	const [cartItemsWithStock, hasStockIssues] = useMemo(() => {
		let hasIssues = false;
		const itemsWithStock = items.map(item => {
			const stockInfo = stockValidation.find((v: StockValidation) => v.productId === item.productId);
			const hasStockIssue = stockInfo && stockInfo.currentStock < item.quantity;
			if (hasStockIssue) {
				hasIssues = hasStockIssue;
			}
			return {
				...item,
				stockInfo,
				hasStockIssue,
			} as CartItemWithStock;
		});

		return [itemsWithStock, hasIssues];
	}, [items, stockValidation]);

	// Update cart items with real stock when validation data is available
	useEffect(() => {
		if (stockValidation.length > 0) {
			stockValidation.forEach(validation => {
				const cartItem = items.find(item => item.productId === validation.productId);
				if (cartItem && cartItem.product.stock !== validation.currentStock) {
					// Update the cart item with the real stock
					updateProductStock(validation.productId, validation.currentStock);
				}
			});
		}
	}, [stockValidation, items, updateProductStock]);

	// Notify parent component about stock issues
	useEffect(() => {
		if (onMissingStock) {
			onMissingStock(hasStockIssues);
		}
	}, [hasStockIssues, onMissingStock]);

	const isCheckoutBlocked = hasStockIssues || isValidatingStock;

	return {
		cartItemsWithStock,
		hasStockIssues,
		isValidatingStock,
		isCheckoutBlocked,
		stockValidation,
	};
}
