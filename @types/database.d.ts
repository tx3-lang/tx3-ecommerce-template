// Database entities matching Supabase schema
declare interface Product {
	id: string;
	name: string;
	description?: string;
	price_lovelace: number;
	stock: number;
	is_active: boolean;
	deleted_at?: string;
	created_at: string;
	updated_at: string;
}

declare interface ProductImage {
	id: string;
	product_id: string;
	url: string;
	alt?: string;
	sort_order: number;
	deleted_at?: string;
	created_at: string;
	updated_at: string;
}

declare interface Order {
	id: string;
	customer_email?: string;
	status: OrderStatus;
	total_lovelace: number;
	wallet_address?: string;
	transaction_hash?: string;
	deleted_at?: string;
	created_at: string;
	updated_at: string;
}

declare interface OrderItem {
	id: string;
	order_id: string;
	product_id: string;
	quantity: number;
	price_lovelace: number;
	token_policy_id?: string;
	token_asset_name?: string;
}

declare interface SupportedToken {
	id: string;
	policy_id: string;
	asset_name: string;
	display_name: string;
	symbol: string;
	decimals: number;
	is_active: boolean;
	deleted_at?: string;
	created_at: string;
	updated_at: string;
}

declare type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
