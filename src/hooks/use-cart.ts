import { useCallback, useMemo } from 'react';

// Contexts
import { useCartContext } from '@/contexts/CartContext';
import { calculateCartTotals } from '@/lib/cart-calculations';
// Lib
import type { CartItem } from '@/lib/cart-storage';

export interface CartHook {
	items: CartItem[];
	addItem: (productId: string, quantity: number, product: Database.Product) => void;
	removeItem: (productId: string) => void;
	updateQuantity: (productId: string, quantity: number) => void;
	updateProductStock: (productId: string, newStock: number) => void;
	clear: () => void;
	refresh: () => void;
	total: number;
	subtotal: number;
	shippingEstimate: number;
	itemCount: number;
	isEmpty: boolean;
	isLoaded: boolean;
	getItemQuantity: (productId: string) => number;
	hasItem: (productId: string) => boolean;
	getTotalItems: () => number;
	clearErrors: () => void;
	currencyBreakdown: ReturnType<typeof calculateCartTotals>['currencyBreakdown'];
	currencies: string[];
}

export function useCart(): CartHook {
	const {
		items: cartItems,
		addItem: contextAddItem,
		removeItem: contextRemoveItem,
		updateQuantity: contextUpdateQuantity,
		updateProductStock: contextUpdateProductStock,
		clear: contextClear,
		refresh: contextRefresh,
		isLoaded,
	} = useCartContext();

	const validateStock = useCallback(
		(productId: string, newQuantity: number, product: CartItem['product']) => {
			if (!product) {
				throw new Error('Product not found');
			}

			const existingItem = cartItems.find(item => item.productId === productId);
			const existingQuantity = existingItem ? existingItem.quantity : 0;
			const totalQuantity = existingQuantity + newQuantity;

			if (totalQuantity > product.stock) {
				throw new Error(`Insufficient stock. Only ${product.stock} available.`);
			}

			return true;
		},
		[cartItems],
	);

	const addItem = useCallback(
		(productId: string, quantity: number, product: Database.Product) => {
			if (quantity <= 0) {
				throw new Error('Quantity must be greater than 0');
			}

			const customProduct: CartItem['product'] = {
				id: product.id,
				name: product.name,
				description: product.description,
				price: product.price,
				token_id: product.token_id,
				stock: product.stock,
				image_url: product.product_images?.[0]?.image_url,
				supported_tokens: product.supported_tokens,
			};

			validateStock(productId, quantity, customProduct);
			contextAddItem(productId, quantity, customProduct);
		},
		[validateStock, contextAddItem],
	);

	const removeItem = useCallback(
		(productId: string) => {
			contextRemoveItem(productId);
		},
		[contextRemoveItem],
	);

	const updateQuantity = useCallback(
		(productId: string, quantity: number) => {
			if (quantity <= 0) {
				removeItem(productId);
				return;
			}

			const existingItem = cartItems.find(item => item.productId === productId);
			if (!existingItem) {
				throw new Error('Item not found in cart');
			}

			const existingQuantity = existingItem ? existingItem.quantity : 0;

			validateStock(productId, quantity - existingQuantity, existingItem.product);
			contextUpdateQuantity(productId, quantity);
		},
		[validateStock, contextUpdateQuantity, removeItem, cartItems],
	);

	const clear = useCallback(() => {
		contextClear();
	}, [contextClear]);

	const refresh = useCallback(() => {
		contextRefresh();
	}, [contextRefresh]);

	const cartMetrics = useMemo(() => {
		const cartTotals = calculateCartTotals(cartItems);
		const itemMap = new Map<string, CartItem>();

		const processedItems = cartItems
			.map(item => {
				if (!item.product) return null;
				const subtotal = item.quantity * item.product.price;
				itemMap.set(item.productId, item);
				return { ...item, subtotal } as CartItem;
			})
			.filter((item): item is CartItem => item !== null)
			.sort((a, b) => b.addedAt - a.addedAt);

		return {
			items: processedItems,
			total: cartTotals.subtotal,
			itemCount: cartTotals.totalItems,
			itemMap,
			currencyBreakdown: cartTotals.currencyBreakdown,
			currencies: cartTotals.currencies,
		};
	}, [cartItems]);

	const subtotal = cartMetrics.total; // No additional taxes or discounts yet

	const shippingEstimate = 0;

	const isEmpty = cartMetrics.items.length === 0;

	const getItemQuantity = useCallback(
		(productId: string) => cartMetrics.itemMap.get(productId)?.quantity ?? 0,
		[cartMetrics.itemMap],
	);

	const hasItem = useCallback((productId: string) => cartMetrics.itemMap.has(productId), [cartMetrics.itemMap]);

	const getTotalItems = useCallback(() => {
		return cartMetrics.itemCount;
	}, [cartMetrics.itemCount]);

	const updateProductStock = useCallback(
		(productId: string, newStock: number) => {
			contextUpdateProductStock(productId, newStock);
		},
		[contextUpdateProductStock],
	);

	const clearErrors = useCallback(() => {
		// Clear any error states related to cart operations
	}, []);

	return {
		items: cartMetrics.items,
		addItem,
		removeItem,
		updateQuantity,
		updateProductStock,
		clear,
		refresh,
		total: cartMetrics.total,
		subtotal,
		shippingEstimate,
		itemCount: cartMetrics.itemCount,
		isEmpty,
		isLoaded,
		getItemQuantity,
		hasItem,
		getTotalItems,
		clearErrors,
		currencyBreakdown: cartMetrics.currencyBreakdown,
		currencies: cartMetrics.currencies,
	};
}
