import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

// Lib
import { type CartItem, type CartStorage, clearCart, createEmptyCart, getCart, saveCart } from '@/lib/cart-storage';

interface CartContextType {
	items: CartItem[];
	addItem: (productId: string, quantity: number, product: CartItem['product']) => Promise<void>;
	removeItem: (productId: string) => Promise<void>;
	updateQuantity: (productId: string, quantity: number) => Promise<void>;
	updateProductStock: (productId: string, newStock: number) => Promise<void>;
	clear: () => Promise<void>;
	refresh: () => void;
	isLoaded: boolean;
	itemCount: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
	const [items, setItems] = useState<CartItem[]>([]);
	const [isLoaded, setIsLoaded] = useState(false);

	// Load cart on mount
	useEffect(() => {
		const initializeCart = () => {
			const cart = getCart() || createEmptyCart();

			// Validate that all items have complete product data
			const validItems = cart.items.filter(
				item => item.product && item.product.id === item.productId && item.product.name && item.product.price,
			);

			setItems(validItems);
			setIsLoaded(true);

			// Save cleaned cart if items were removed
			if (validItems.length !== cart.items.length) {
				const cleanedCart: CartStorage = {
					items: validItems,
					metadata: {
						version: '1.0.0',
						lastUpdated: Date.now(),
					},
				};
				saveCart(cleanedCart);
			}
		};

		initializeCart();

		// Listen for storage events from other tabs
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === 'ecommerce-cart') {
				const updatedCart = getCart() || createEmptyCart();
				setItems(updatedCart.items);
			}
		};

		window.addEventListener('storage', handleStorageChange);
		return () => window.removeEventListener('storage', handleStorageChange);
	}, []);

	const persistCart = async (updatedItems: CartItem[]) => {
		const cart: CartStorage = {
			items: updatedItems,
			metadata: {
				version: '1.0.0',
				lastUpdated: Date.now(),
			},
		};
		saveCart(cart);
		setItems(updatedItems);

		// Dispatch storage event for other tabs
		window.dispatchEvent(
			new StorageEvent('storage', {
				key: 'ecommerce-cart',
				newValue: JSON.stringify(cart),
			}),
		);
	};

	const addItem = async (productId: string, quantity: number, product: CartItem['product']) => {
		if (quantity <= 0) {
			throw new Error('Quantity must be greater than 0');
		}

		if (!product) {
			throw new Error('Product information required for offline cart');
		}

		const currentItems = [...items];
		const existingItemIndex = currentItems.findIndex(item => item.productId === productId);
		const existingQuantity = existingItemIndex >= 0 ? currentItems[existingItemIndex].quantity : 0;
		const totalQuantity = existingQuantity + quantity;

		if (totalQuantity > product.stock) {
			throw new Error(`Insufficient stock. Only ${product.stock} available.`);
		}

		if (existingItemIndex >= 0) {
			currentItems[existingItemIndex].quantity += quantity;
			// Update subtotal
			currentItems[existingItemIndex].subtotal = currentItems[existingItemIndex].quantity * product.price;
		} else {
			currentItems.push({
				productId,
				quantity,
				addedAt: Date.now(),
				product,
				subtotal: quantity * product.price,
			});
		}

		await persistCart(currentItems);
	};

	const removeItem = async (productId: string) => {
		const updatedItems = items.filter(item => item.productId !== productId);
		await persistCart(updatedItems);
	};

	const updateQuantity = async (productId: string, quantity: number) => {
		if (quantity <= 0) {
			await removeItem(productId);
			return;
		}

		const existingItem = items.find(item => item.productId === productId);
		if (!existingItem) {
			throw new Error('Item not found in cart');
		}

		const product = existingItem.product;
		if (quantity > product.stock) {
			throw new Error(`Insufficient stock. Only ${product.stock} available.`);
		}

		const updatedItems = items.map(item =>
			item.productId === productId ? { ...item, quantity, subtotal: quantity * item.product.price } : item,
		);
		await persistCart(updatedItems);
	};

	const updateProductStock = async (productId: string, newStock: number) => {
		const updatedItems = items.map(item => {
			if (item.productId === productId) {
				// Update the stock in the product data but keep the user's quantity
				const updatedProduct = { ...item.product, stock: newStock };
				return {
					...item,
					product: updatedProduct,
					// Keep the original quantity and subtotal
				};
			}
			return item;
		});

		await persistCart(updatedItems);
	};

	const clear = async () => {
		clearCart();
		setItems([]);
	};

	const refresh = () => {
		const cart = getCart() || createEmptyCart();

		// Validate that all items have complete product data
		const validItems = cart.items.filter(
			item => item.product && item.product.id === item.productId && item.product.name && item.product.price,
		);

		setItems(validItems);

		// Save cleaned cart if items were removed
		if (validItems.length !== cart.items.length) {
			const cleanedCart: CartStorage = {
				items: validItems,
				metadata: {
					version: '1.0.0',
					lastUpdated: Date.now(),
				},
			};
			saveCart(cleanedCart);
		}
	};

	const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

	return (
		<CartContext.Provider
			value={{
				items,
				addItem,
				removeItem,
				updateQuantity,
				updateProductStock,
				clear,
				refresh,
				isLoaded,
				itemCount,
			}}
		>
			{children}
		</CartContext.Provider>
	);
}

export function useCartContext() {
	const context = useContext(CartContext);
	if (!context) {
		throw new Error('useCartContext must be used within a CartProvider');
	}
	return context;
}
