import { useCallback, useState } from 'react';

// Hooks
import { useCart } from '@/hooks/use-cart';
import { useCreateMultiCurrencyOrders } from '@/hooks/use-multi-currency-orders';
import { useWallet } from '@/hooks/use-wallet';

// Lib
import { getOrdersDataFromCart } from '@/lib/cart-calculations';

export function useCheckout() {
	const [processing, setProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { wallet } = useWallet();
	const { items: cartItems, clear } = useCart();
	const createMultiCurrencyOrders = useCreateMultiCurrencyOrders();

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

	const createOrder = useCallback(async (orderData: any): Promise<Database.Order | null> => {
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
			// Get wallet address
			const addresses = await wallet.getUsedAddresses();
			if (addresses.length === 0) {
				setError('No wallet address found');
				return null;
			}
			const walletAddress = addresses[0];

			// Convert cart items to orders data (one order per currency)
			const ordersData = getOrdersDataFromCart(cartItems, walletAddress);

			// Create orders in database
			const createdOrders = await createMultiCurrencyOrders.mutateAsync(ordersData);

			// Clear cart after successful order creation
			await clear();

			return createdOrders;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Order creation failed';
			setError(errorMessage);
			return null;
		} finally {
			setProcessing(false);
		}
	}, [wallet, cartItems, clear, createMultiCurrencyOrders]);

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
