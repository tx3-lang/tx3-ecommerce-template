import { useCallback, useState } from 'react';

// Hooks
import { useCart } from '@/hooks/use-cart';
import { useCreateMultiCurrencyOrders } from '@/hooks/use-multi-currency-orders';
import { useValidateBulkStock } from '@/hooks/use-stock-reservation';
import { useWallet } from '@/hooks/use-wallet';

// Lib
import { getOrdersDataFromCart } from '@/lib/cart-calculations';

export function useCheckout() {
	const [processing, setProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { wallet } = useWallet();
	const { items: cartItems, clear } = useCart();
	const createMultiCurrencyOrders = useCreateMultiCurrencyOrders();
	const validateCartStockMutation = useValidateBulkStock();

	const processPayment = useCallback(
		async (paymentRequest: PaymentRequest): Promise<TransactionResult> => {
			if (!wallet) {
				return {
					hash: '',
					success: false,
					error: 'No wallet connected',
				};
			}

			setProcessing(true);
			setError(null);

			try {
				const { submitTransaction } = await import('../lib/cardano');
				const result = await submitTransaction(wallet, paymentRequest);

				if (!result.success) {
					setError(result.error || 'Payment failed');
				}

				return result;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Payment processing failed';
				setError(errorMessage);
				return {
					hash: '',
					success: false,
					error: errorMessage,
				};
			} finally {
				setProcessing(false);
			}
		},
		[wallet],
	);

	const createOrder = useCallback(async (orderData: Database.CreateOrderData): Promise<Database.Order | null> => {
		try {
			// Legacy order creation - kept for backward compatibility
			console.log('Creating order:', orderData);
			return null;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Order creation failed';
			setError(errorMessage);
			return null;
		}
	}, []);

	const createMultiCurrencyOrder = useCallback(async (): Promise<Database.Order[] | null> => {
		if (!wallet) {
			setError('No wallet connected');
			return null;
		}

		setProcessing(true);
		setError(null);

		try {
			// Step 1: Validate stock for all cart items
			const cartItemsForValidation = cartItems.map(item => ({
				product_id: item.productId,
				quantity: item.quantity,
			}));

			const stockValidation = await validateCartStockMutation.mutateAsync(cartItemsForValidation);

			if (!stockValidation.success) {
				setError(stockValidation.message || 'Some items have insufficient stock. Please update your cart.');
				return null;
			}

			// Step 2: Get wallet address
			const addresses = await wallet.getUsedAddresses();
			if (addresses.length === 0) {
				setError('No wallet address found');
				return null;
			}
			const walletAddress = addresses[0];

			// Step 3: Convert cart items to orders data (one order per currency)
			const ordersData = getOrdersDataFromCart(cartItems, walletAddress);

			// Step 4: Create orders in database
			const createdOrders = await createMultiCurrencyOrders.mutateAsync(ordersData);

			// Step 5: Clear cart after successful order creation
			await clear();

			return createdOrders;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Order creation failed';

			// Handle specific stock-related errors
			if (errorMessage.includes('Insufficient stock')) {
				setError('Some items in your cart are no longer available. Please update your cart.');
			} else if (errorMessage.includes('Token')) {
				setError('Invalid payment token used. Please try again.');
			} else {
				setError(errorMessage);
			}

			return null;
		} finally {
			setProcessing(false);
		}
	}, [wallet, cartItems, clear, createMultiCurrencyOrders, validateCartStockMutation]);

	const processMultiCurrencyPayments = useCallback(
		async (orders: Database.Order[]): Promise<TransactionResult[]> => {
			if (!wallet) {
				return [
					{
						hash: '',
						success: false,
						error: 'No wallet connected',
					},
				];
			}

			setProcessing(true);
			setError(null);

			const results: TransactionResult[] = [];

			try {
				const { submitTransaction } = await import('../lib/cardano');

				// Process payment for each order
				for (const order of orders) {
					// Get token metadata if it's a token order
					let tokenPolicyId: string | undefined;
					let tokenAssetName: string | undefined;

					if (order.token_id && order.supported_tokens) {
						tokenPolicyId = order.supported_tokens.policy_id;
						tokenAssetName = order.supported_tokens.asset_name;
					}

					const paymentRequest = {
						amount_lovelace: order.total_amount,
						token_policy_id: tokenPolicyId,
						token_asset_name: tokenAssetName,
						recipient_address: 'addr_test1... TODO: Add merchant address', // TODO: Use merchant address
					};

					const result = await submitTransaction(wallet, paymentRequest);
					results.push(result);

					if (!result.success) {
						setError(`Payment failed for order ${order.id}: ${result.error}`);
						break;
					}
				}

				return results;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Payment processing failed';
				setError(errorMessage);
				return [
					{
						hash: '',
						success: false,
						error: errorMessage,
					},
				];
			} finally {
				setProcessing(false);
			}
		},
		[wallet],
	);

	return {
		processing,
		error,
		processPayment,
		createOrder,
		createMultiCurrencyOrder,
		processMultiCurrencyPayments,
	};
}
