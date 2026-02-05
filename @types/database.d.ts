declare namespace Database {
	type OrderStatus = 'pending' | 'payment_failed' | 'paid' | 'processing' | 'shipped' | 'completed' | 'cancelled';

	interface Product {
		id: string;
		name: string;
		description: string | null;
		price: number;
		token_id: string | null;
		stock: number;
		is_active: boolean;
		is_featured: boolean;
		created_at: string;
		updated_at: string;
		deleted_at: string | null;
		product_images: ProductImage[] | null;
		supported_tokens: SupportedToken | null;
	}

	interface ProductImage {
		id: string;
		product_id: string;
		image_url: string;
		alt_text: string | null;
		display_order: number;
		created_at: string;
	}

	interface Order {
		id: string;
		wallet_address: string;
		total_amount: number;
		status: OrderStatus;
		cardano_tx_hash: string | null;
		payment_error: string | null;
		is_timeout: boolean;
		retry_count: number;
		can_cancel: boolean;
		token_id: string | null;
		shipping_id: string | null;
		order_items: OrderItem[] | null;
		created_at: string;
		updated_at: string;
		deleted_at: string | null;
		supported_tokens: SupportedToken | null;
		shipping_info?: ShippingInfo | null;
	}

	interface ShippingInfo {
		id: string;
		wallet_address: string;
		full_name: string;
		email: string;
		phone: string | null;
		address: string;
		city: string;
		postal_code: string;
		country: string;
		created_at: string;
		updated_at: string;
	}

	interface OrderItem {
		id: string;
		order_id: string;
		product_id: string;
		products: Product | null;
		quantity: number;
		price: number;
		token_id: string | null;
		created_at: string;
		supported_tokens: SupportedToken | null;
	}

	interface CreateOrderData {
		wallet_address: string;
		items: {
			product_id: string;
			quantity: number;
			price: number;
			token_id: string | null;
		}[];
		total_amount: number;
		token_id: string | null;
	}

	// Input type for order items (without calculated fields)
	interface OrderItemInput {
		product_id: string;
		quantity: number;
		price: number;
		token_id?: string | null;
	}

	// Helper type for multi-order creation during checkout
	interface CreateMultiCurrencyOrdersData {
		wallet_address: string;
		orders: {
			items: OrderItemInput[];
			token_id?: string | null;
		}[];
		currencies?: Record<string, { policy_id: string | null; asset_name: string | null; decimals: number | null }>;
		shipping_info?: {
			fullName: string;
			email: string;
			phone?: string;
			address: string;
			city: string;
			postalCode: string;
			country: string;
		};
	}

	// Supported tokens table interface
	interface SupportedToken {
		id: string;
		policy_id: string;
		asset_name: string;
		display_name: string | null;
		decimals: number;
		is_active: boolean;
		created_at: string;
		updated_at: string;
	}
}
