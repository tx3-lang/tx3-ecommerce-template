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

	type OrderEventType = 'paid' | 'shipped' | 'completed' | 'cancelled';

	// JSON value type — concrete enough for TanStack Start's server-fn return
	// inference to serialise cleanly. `Record<string, unknown>` here breaks
	// `createServerFn` typing in src/server-fns/orders.ts.
	type JsonPrimitive = string | number | boolean | null;
	type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

	interface OrderEvent {
		id: string;
		order_id: string;
		event_type: OrderEventType;
		tx_hash: string;
		payload: { [key: string]: JsonValue };
		submitted_at: string;
		confirmed_at: string | null;
	}

	type EscrowStatus = 'pending' | 'shipped' | 'released' | 'refunded';

	interface Escrow {
		id: string;
		order_id: string;
		script_address: string;
		utxo_tx_hash: string;
		utxo_output_index: number;
		status: EscrowStatus;
		buyer_pkh: string;
		merchant_pkh: string;
		paid_at: string;
		ship_deadline: string;
		grace_period_end: string | null;
		datum_cbor: string;
		shipped_tx_hash: string | null;
		release_tx_hash: string | null;
		refund_tx_hash: string | null;
		created_at: string;
		updated_at: string;
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
		carrier: string | null;
		tracking_number: string | null;
		order_items: OrderItem[] | null;
		created_at: string;
		updated_at: string;
		deleted_at: string | null;
		supported_tokens: SupportedToken | null;
		shipping_info?: ShippingInfo | null;
		events?: OrderEvent[] | null;
		escrow?: Escrow | null;
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

	type BadgeKind = 'buyer_first_purchase' | 'seller_first_delivery';

	interface IssuedBadge {
		id: string;
		kind: BadgeKind;
		recipient_pkh: string;
		recipient_address: string;
		triggering_order_id: string;
		policy_id: string;
		asset_name_hex: string;
		mint_tx_hash: string;
		metadata: { [key: string]: JsonValue };
		minted_at: string;
	}
}
