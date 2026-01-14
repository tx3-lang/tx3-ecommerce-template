declare interface ApiResponse<T> {
	data: T;
	error?: string;
	message?: string;
}

declare interface ProductListResponse {
	products: Product[];
	total: number;
	page: number;
	limit: number;
}

declare interface CreateOrderRequest {
	items: OrderItemRequest[];
	customer_email?: string;
}

declare interface OrderItemRequest {
	product_id: string;
	quantity: number;
	token_policy_id?: string;
	token_asset_name?: string;
}

declare interface CreateOrderResponse {
	order: Order;
	payment_request: PaymentRequest;
}
