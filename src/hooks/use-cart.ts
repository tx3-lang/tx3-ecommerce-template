import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

import {
	type CartItem,
	type CartStorage,
	clearCart,
	createEmptyCart,
	getCart,
	getItemQuantity,
	saveCart,
} from '../lib/cart-storage';

export interface ExtendedCartItem extends CartItem {
	product: Database.Product;
	subtotal: number;
}

export interface CartHook {
	items: ExtendedCartItem[];
	addItem: (productId: string, quantity: number) => void;
	removeItem: (productId: string) => void;
	updateQuantity: (productId: string, quantity: number) => void;
	clear: () => void;
	total: number;
	itemCount: number;
	isEmpty: boolean;
}

export function useCart(): CartHook {
	const queryClient = useQueryClient();

	const cart = useMemo(() => {
		return getCart() || createEmptyCart();
	}, []);

	const products = queryClient.getQueryData<Database.Product[]>(['products']) || [];

	const validateStock = useCallback(
		(productId: string, newQuantity: number) => {
			const product = products.find(p => p.id === productId);
			if (!product) {
				throw new Error('Product not found');
			}

			const existingQuantity = getItemQuantity(productId);
			const totalQuantity = existingQuantity + newQuantity;

			if (totalQuantity > product.stock) {
				throw new Error(`Insufficient stock. Only ${product.stock} available.`);
			}

			return true;
		},
		[products],
	);

	const persistCart = useCallback((updatedCart: CartStorage) => {
		saveCart(updatedCart);
	}, []);

	const addItem = useCallback(
		(productId: string, quantity: number) => {
			if (quantity <= 0) {
				throw new Error('Quantity must be greater than 0');
			}

			validateStock(productId, quantity);

			const updatedCart = getCart() || createEmptyCart();

			const existingItemIndex = updatedCart.items.findIndex(item => item.productId === productId);

			if (existingItemIndex >= 0) {
				updatedCart.items[existingItemIndex].quantity += quantity;
			} else {
				updatedCart.items.push({
					productId,
					quantity,
					addedAt: Date.now(),
				});
			}

			persistCart(updatedCart);
		},
		[validateStock, persistCart],
	);

	const removeItem = useCallback(
		(productId: string) => {
			const updatedCart = getCart() || createEmptyCart();

			updatedCart.items = updatedCart.items.filter(item => item.productId !== productId);

			persistCart(updatedCart);
		},
		[persistCart],
	);

	const updateQuantity = useCallback(
		(productId: string, quantity: number) => {
			if (quantity <= 0) {
				removeItem(productId);
				return;
			}

			validateStock(productId, quantity - getItemQuantity(productId));

			const updatedCart = getCart() || createEmptyCart();

			const itemIndex = updatedCart.items.findIndex(item => item.productId === productId);

			if (itemIndex >= 0) {
				updatedCart.items[itemIndex].quantity = quantity;
				persistCart(updatedCart);
			}
		},
		[validateStock, removeItem, persistCart],
	);

	const clear = useCallback(() => {
		clearCart();
	}, []);

	const extendedItems = useMemo(() => {
		return cart.items
			.map(item => {
				const product = products.find(p => p.id === item.productId);
				if (!product) return null;

				return {
					...item,
					product,
					subtotal: item.quantity * product.price_lovelace,
				} as ExtendedCartItem;
			})
			.filter((item): item is ExtendedCartItem => item !== null)
			.sort((a, b) => b.addedAt - a.addedAt);
	}, [cart.items, products]);

	const total = useMemo(() => {
		return extendedItems.reduce((sum, item) => sum + item.subtotal, 0);
	}, [extendedItems]);

	const itemCount = useMemo(() => {
		return extendedItems.reduce((sum, item) => sum + item.quantity, 0);
	}, [extendedItems]);

	const isEmpty = useMemo(() => {
		return extendedItems.length === 0;
	}, [extendedItems]);

	useEffect(() => {
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === 'ecommerce-cart') {
				queryClient.invalidateQueries({ queryKey: ['cart'] });
			}
		};

		window.addEventListener('storage', handleStorageChange);
		return () => window.removeEventListener('storage', handleStorageChange);
	}, [queryClient]);

	return {
		items: extendedItems,
		addItem,
		removeItem,
		updateQuantity,
		clear,
		total,
		itemCount,
		isEmpty,
	};
}