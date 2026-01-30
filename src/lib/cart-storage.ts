export interface CartItem {
	productId: string;
	quantity: number;
	addedAt: number;
	product: {
		id: string;
		name: string;
		description: string | null;
		price: number;
		token_id: string | null;
		stock: number;
		image_url?: string;
		supported_tokens: Database.SupportedToken | null;
	};
	subtotal: number;
}

export interface CartItemWithCurrency extends CartItem {
	currencyKey: string;
	currencyType: 'ADA' | 'TOKEN';
	currencySymbol: string;
	currencyDecimals: number;
}

export interface CartStorage {
	items: CartItem[];
	metadata: {
		version: string;
		lastUpdated: number;
	};
}

const STORAGE_KEY = 'ecommerce-cart';
const VERSION = '1.0.0';

export function getCart(): CartStorage | null {
	if (typeof window === 'undefined') return null;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		const cart: CartStorage = JSON.parse(stored);

		// Validate structure
		if (!cart.items || !Array.isArray(cart.items) || !cart.metadata) {
			clearCart();
			return null;
		}

		// Filter out invalid items
		cart.items = cart.items.filter(
			item =>
				item.productId &&
				typeof item.quantity === 'number' &&
				item.quantity > 0 &&
				item.product &&
				item.product.id === item.productId,
		);

		return cart;
	} catch (error) {
		console.error('Failed to parse cart from localStorage:', error);
		clearCart();
		return null;
	}
}

export function saveCart(cart: CartStorage): void {
	if (typeof window === 'undefined') return;

	try {
		cart.metadata = {
			version: VERSION,
			lastUpdated: Date.now(),
		};

		localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
	} catch (error) {
		console.error('Failed to save cart to localStorage:', error);
	}
}

export function clearCart(): void {
	if (typeof window === 'undefined') return;

	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch (error) {
		console.error('Failed to clear cart from localStorage:', error);
	}
}

export function getItemQuantity(productId: string): number {
	const cart = getCart();
	if (!cart) return 0;

	const item = cart.items.find(item => item.productId === productId);
	return item ? item.quantity : 0;
}

export function createEmptyCart(): CartStorage {
	return {
		items: [],
		metadata: {
			version: VERSION,
			lastUpdated: Date.now(),
		},
	};
}
