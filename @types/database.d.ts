declare namespace Database {
	type OrderStatus = 'pending' | 'payment_failed' | 'paid' | 'processing' | 'shipped' | 'completed' | 'cancelled';

	interface Product {
		id: string;
		name: string;
		description: string | null;
		price_lovelace: number;
		stock: number;
		is_active: boolean;
		is_featured: boolean;
		created_at: string;
		updated_at: string;
		deleted_at: string | null;
		product_images: ProductImage[] | null;
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
		total_lovelace: number;
		status: OrderStatus;
		cardano_tx_hash: string | null;
		payment_error: string | null;
		is_timeout: boolean;
		retry_count: number;
		can_cancel: boolean;
		order_items: OrderItem[] | null;
		created_at: string;
		updated_at: string;
		deleted_at: string | null;
	}

	interface OrderItem {
		id: string;
		order_id: string;
		product_id: string;
		products: Product | null;
		quantity: number;
		price_lovelace: number;
		created_at: string;
	}

	interface CreateOrderData {
		wallet_address: string;
		items: {
			product_id: string;
			quantity: number;
			price_lovelace: number;
		}[];
		total_lovelace: number;
	}
}
