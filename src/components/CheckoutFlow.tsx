import { useId, useState } from 'react';

// Components
import { CheckoutStepSkeleton, StepIndicatorSkeleton } from '@/components/checkout/CheckoutSkeletons';
import { ConfirmationStep } from '@/components/checkout/ConfirmationStep';
import { PaymentStep } from '@/components/checkout/PaymentStep';
import { ReviewStep } from '@/components/checkout/ReviewStep';
import { ShippingStep } from '@/components/checkout/ShippingStep';
import { StepIndicator } from '@/components/StepIndicator';

// Hooks
import { useCart } from '@/hooks/use-cart';
import { useCreateMultiCurrencyOrders } from '@/hooks/use-multi-currency-orders';
import { useCreateOrder, useUpdateOrderStatus } from '@/hooks/use-orders-server-fns';
import { useValidateBulkStock } from '@/hooks/use-stock-reservation';
import { useWallet } from '@/hooks/use-wallet';
import { type OrderPaymentInfo, processMultiCurrencyPayments } from '@/lib/cardano-payment';
// Lib
import { getOrdersDataFromCart } from '@/lib/cart-calculations';
import type { CurrencyPaymentStatus } from './checkout/PaymentStep';

type CheckoutStep = 'review' | 'shipping' | 'payment' | 'confirmation';

interface ShippingInfo {
	fullName: string;
	email: string;
	phone?: string;
	address: string;
	city: string;
	postalCode: string;
	country: string;
}

interface CheckoutFlowProps {
	onComplete?: (orderId: string) => void;
}

export function CheckoutFlow({ onComplete }: CheckoutFlowProps) {
	const idBase = useId();
	const [step, setStep] = useState<CheckoutStep>('review');
	const [paymentError, setPaymentError] = useState<string | null>(null);
	const [createdOrder, setCreatedOrder] = useState<Database.Order | null>(null);
	const [createdOrders, setCreatedOrders] = useState<Database.Order[]>([]);
	const [paymentStatuses, setPaymentStatuses] = useState<CurrencyPaymentStatus[]>([]);
	const [shippingInfo, setShippingInfo] = useState<ShippingInfo>({
		fullName: '',
		email: '',
		phone: '',
		address: '',
		city: '',
		postalCode: '',
		country: '',
	});

	const { items, total, clear, isLoaded: cartLoaded, currencyBreakdown } = useCart();
	const { wallet, isConnected, connect, availableWallets } = useWallet();
	const createOrderMutation = useCreateOrder();
	const createMultiCurrencyOrdersMutation = useCreateMultiCurrencyOrders();
	const updateOrderStatusMutation = useUpdateOrderStatus();
	const validateCartStockMutation = useValidateBulkStock();

	const handleProceedToShipping = () => {
		setStep('shipping');
	};

	const handleProceedToPayment = async () => {
		// Validate shipping info
		if (!shippingInfo.fullName || !shippingInfo.email || !shippingInfo.address || !shippingInfo.city) {
			setPaymentError('Please fill in all required shipping information');
			return;
		}

		setPaymentError(null);
		setStep('payment');
	};

	const createOrderIfNeeded = async (walletInstance: NonNullable<typeof wallet>) => {
		// Check if we need multi-currency orders
		const hasMultipleCurrencies = currencyBreakdown && Object.keys(currencyBreakdown).length > 1;


		if (hasMultipleCurrencies) {
			// Multi-currency flow
			if (createdOrders.length > 0) return createdOrders;

			try {
				// Step 1: Validate stock for all cart items
				const cartItemsForValidation = items.map(item => ({
					product_id: item.productId,
					quantity: item.quantity,
				}));

				const stockValidation = await validateCartStockMutation.mutateAsync(cartItemsForValidation);

				if (!stockValidation.success) {
					setPaymentError(stockValidation.message || 'Some items have insufficient stock. Please update your cart.');
					return null;
				}

				// Step 2: Get wallet address
				const walletAddress = (await walletInstance.getUsedAddresses())?.[0] ?? await walletInstance.getChangeAddress();

				// Step 3: Create multiple orders (one per currency)
				const ordersData = getOrdersDataFromCart(items, walletAddress);

				console.log(ordersData);
				const orders = await createMultiCurrencyOrdersMutation.mutateAsync(ordersData);
				console.log(orders);

				if (orders && orders.length > 0) {
					setCreatedOrders(orders);
					return orders;
				}

				setPaymentError('Failed to create orders: Invalid response from server');
				return null;
			} catch (error) {
				console.error('Failed to create orders:', error);
				handleOrderCreationError(error);
				return null;
			}
		} else {
			// Single currency flow (legacy)
			if (createdOrder) return [createdOrder];

			try {
				// Step 1: Validate stock for all cart items
				const cartItemsForValidation = items.map(item => ({
					product_id: item.productId,
					quantity: item.quantity,
				}));

				const stockValidation = await validateCartStockMutation.mutateAsync(cartItemsForValidation);

				if (!stockValidation.success) {
					setPaymentError(stockValidation.message || 'Some items have insufficient stock. Please update your cart.');
					return null;
				}

				// Step 2: Get wallet address
				const walletAddress = await walletInstance.getChangeAddress();

				// Step 3: Create order with stock reservation
				const orderData = {
					wallet_address: walletAddress,
					items: items.map(item => ({
						product_id: item.productId,
						quantity: item.quantity,
						price: item.product.price,
						token_id: item.product.token_id,
					})),
					total_amount: total,
					token_id: items[0]?.product.token_id || null,
				};

				const order = await createOrderMutation.mutateAsync(orderData);
				if (order) {
					setCreatedOrder(order);
					return [order];
				}

				setPaymentError('Failed to create order: Invalid response from server');
				return null;
			} catch (error) {
				console.error('Failed to create order:', error);
				handleOrderCreationError(error);
				return null;
			}
		}
	};

	const handleOrderCreationError = (error: unknown) => {
		// Handle specific stock-related errors
		if (error instanceof Error) {
			if (error.message.includes('Insufficient stock')) {
				setPaymentError('Some items in your cart are no longer available. Please update your cart.');
			} else if (error.message.includes('Token')) {
				setPaymentError('Invalid payment token used. Please try again.');
			} else {
				setPaymentError('Failed to create order. Please try again.');
			}
		} else {
			setPaymentError('Failed to create order. Please try again.');
		}
	};

	const handleWalletConnect = async (walletName: string) => {
		try {
			await connect(walletName);
			setPaymentError(null);

			if (wallet) {
				await createOrderIfNeeded(wallet);
			}
		} catch (error) {
			console.error('Failed to connect wallet:', error);
			setPaymentError('Failed to connect wallet. Please try again.');
		}
	};

	const handlePayment = async () => {
		if (!wallet) {
			setPaymentError('Please connect your wallet to continue.');
			return;
		}

		const orders = await createOrderIfNeeded(wallet);
		if (!orders || orders.length === 0) return;

		setPaymentError(null);

		try {
			// Check if multi-currency payment is needed
			if (orders.length > 1) {
				// Multi-currency payment flow
				// Initialize payment statuses
				const initialStatuses: CurrencyPaymentStatus[] = orders.map(order => {
					const currencyKey = order.token_id ? `TOKEN_${order.token_id}` : 'ADA';
					const currencyData = currencyBreakdown?.[currencyKey];

					return {
						currencyKey,
						currencySymbol: currencyData?.currencySymbol || '₳',
						amount: order.total_amount,
						status: 'pending',
						policyId: currencyData?.policyId,
						assetName: currencyData?.assetName,
						decimals: currencyData?.currencyDecimals || 6,
					};
				});
				setPaymentStatuses(initialStatuses);

				// Convert orders to payment info
				const paymentsInfo: OrderPaymentInfo[] = orders.map(order => ({
					id: order.id,
					amount: order.total_amount,
					policyId: order.supported_tokens?.policy_id,
					assetName: order.supported_tokens?.asset_name,
				}));


				console.log('Starting multi-currency payment for orders:', orders);
				// Process payments with progress tracking
				const result = await processMultiCurrencyPayments(wallet, paymentsInfo, (orderId, status, paymentResult) => {
					setPaymentStatuses(prev =>
						prev.map(ps => {
							const order = orders.find(o => o.id === orderId);
							if (!order) return ps;

							const currencyKey = order.token_id ? `TOKEN_${order.token_id}` : 'ADA';
							if (ps.currencyKey !== currencyKey) return ps;

							return {
								...ps,
								status: status as CurrencyPaymentStatus['status'],
								txHash: paymentResult?.txHash,
								error: paymentResult?.error,
							};
						}),
					);
				});

				if (result.allCompleted) {
					// Update all orders to paid
					for (const completed of result.completedOrders) {
						await updateOrderStatusMutation.mutateAsync({
							orderId: completed.orderId,
							status: 'paid',
							txHash: completed.txHash,
						});
					}

					// Clear cart
					clear();

					// Set success state
					setStep('confirmation');

					// Call completion callback with first order
					onComplete?.(orders[0].id);
				} else {
					// Handle partial success
					// Update completed orders
					for (const completed of result.completedOrders) {
						await updateOrderStatusMutation.mutateAsync({
							orderId: completed.orderId,
							status: 'paid',
							txHash: completed.txHash,
						});
					}

					// Update failed orders
					for (const failed of result.failedOrders) {
						await updateOrderStatusMutation.mutateAsync({
							orderId: failed.orderId,
							status: 'payment_failed',
							error: failed.error,
						});
					}

					setPaymentError(
						`Payment partially completed. ${result.completedOrders.length} of ${orders.length} payments succeeded. Failed: ${result.failedOrders[0]?.error || 'Unknown error'}`,
					);
				}
			} else {
				// Single payment flow (legacy)
				const order = orders[0];
				const paymentResult = await processMultiCurrencyPayments(wallet, [
					{
						id: order.id,
						amount: order.total_amount,
						policyId: order.supported_tokens?.policy_id,
						assetName: order.supported_tokens?.asset_name,
					},
				]);

				if (paymentResult.success && paymentResult.completedOrders[0]) {
					// Update order status to paid
					await updateOrderStatusMutation.mutateAsync({
						orderId: order.id,
						status: 'paid',
						txHash: paymentResult.completedOrders[0].txHash,
					});

					// Clear cart
					clear();

					// Set success state
					setStep('confirmation');

					// Call completion callback
					onComplete?.(order.id);
				} else {
					// Update order status to failed
					await updateOrderStatusMutation.mutateAsync({
						orderId: order.id,
						status: 'payment_failed',
						error: paymentResult.failedOrders[0]?.error || 'Payment failed',
					});

					setPaymentError(paymentResult.failedOrders[0]?.error || 'Payment failed');
				}
			}
		} catch (error) {
			console.error('Payment processing failed:', error);
			setPaymentError('Payment processing failed. Please try again.');
		}
	};

	const handleRetry = () => {
		setPaymentError(null);
		setPaymentStatuses([]);
		setStep('review');
	};

	const isLoading =
		createOrderMutation.isPending || createMultiCurrencyOrdersMutation.isPending || updateOrderStatusMutation.isPending;

	// Show full page skeleton while cart is loading
	if (!cartLoaded) {
		return (
			<div className="max-w-4xl mx-auto p-6">
				<StepIndicatorSkeleton />
				<CheckoutStepSkeleton icon={<div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse" />} itemCount={2} />
			</div>
		);
	}

	return (
		<div className="max-w-4xl mx-auto p-6">
			<StepIndicator
				current={step}
				steps={[
					{ id: 'review', label: 'Review' },
					{ id: 'shipping', label: 'Shipping' },
					{ id: 'payment', label: 'Payment' },
					{ id: 'confirmation', label: 'Confirmation' },
				]}
			/>

			<div className="mt-8">
				{step === 'review' && <ReviewStep total={total} isLoading={isLoading} onProceed={handleProceedToShipping} />}
				{step === 'shipping' && (
					<ShippingStep
						shippingInfo={shippingInfo}
						onShippingInfoChange={setShippingInfo}
						onProceed={handleProceedToPayment}
						onBack={() => setStep('review')}
						isLoading={isLoading}
						error={paymentError}
						idBase={idBase}
					/>
				)}
				{step === 'payment' && (
					<PaymentStep
						total={total}
						availableWallets={availableWallets}
						isConnected={isConnected}
						isLoading={isLoading}
						onWalletConnect={handleWalletConnect}
						onPayment={handlePayment}
						onBack={() => setStep('shipping')}
						error={paymentError}
						paymentStatuses={paymentStatuses}
					/>
				)}
				{step === 'confirmation' && (
					<ConfirmationStep total={total} createdOrder={createdOrder} error={paymentError} onRetry={handleRetry} />
				)}
			</div>
		</div>
	);
}
