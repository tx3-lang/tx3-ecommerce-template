import { useEffect, useId, useRef, useState } from 'react';

// Components
import { CheckoutStepSkeleton, StepIndicatorSkeleton } from '@/components/checkout/CheckoutSkeletons';
import { ConfirmationStep } from '@/components/checkout/ConfirmationStep';
import { PaymentStep } from '@/components/checkout/PaymentStep';
import { ReviewStep } from '@/components/checkout/ReviewStep';
import { type ShippingInfo, ShippingStep } from '@/components/checkout/ShippingStep';
import { StepIndicator } from '@/components/StepIndicator';
// Lib
import { brandConfig } from '@/config/brand';
// Hooks
import { useCart } from '@/hooks/use-cart';
import { useCreateOrders, useUpdateOrderStatus, useValidateBulkStock } from '@/hooks/use-orders-server-fns';
import { useWallet } from '@/hooks/use-wallet';
import { type OrderPaymentInfo, processMultiCurrencyPayments } from '@/lib/cardano-payment';
import { getOrdersDataFromCart } from '@/lib/cart-calculations';
import type { CurrencyPaymentStatus } from './checkout/PaymentStep';

type CheckoutStep = 'review' | 'shipping' | 'payment' | 'confirmation';

interface CheckoutFlowProps {
	onComplete?: (orderId: string) => void;
}

export function CheckoutFlow({ onComplete }: CheckoutFlowProps) {
	const idBase = useId();
	const [step, setStep] = useState<CheckoutStep>('review');
	const [paymentError, setPaymentError] = useState<string | null>(null);
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
	const enableShipping = brandConfig.features.enableShipping;

	const { items, total, clear, isEmpty, isLoaded: cartLoaded, currencyBreakdown } = useCart();
	const { wallet, isConnected, connect, availableWallets } = useWallet();
	const createOrdersMutation = useCreateOrders();
	const updateOrderStatusMutation = useUpdateOrderStatus();
	const validateCartStockMutation = useValidateBulkStock();
	const hasClearedCartRef = useRef(false);

	const updateOrderInState = (updatedOrder: Database.Order) => {
		setCreatedOrders(prev => prev.map(order => (order.id === updatedOrder.id ? updatedOrder : order)));
	};

	const handleProceedToShipping = () => {
		setStep(enableShipping ? 'shipping' : 'payment');
	};

	const handleProceedToPayment = async () => {
		if (!enableShipping) {
			setPaymentError(null);
			setStep('payment');
			return;
		}

		// Validate shipping info
		if (!shippingInfo.fullName || !shippingInfo.email || !shippingInfo.address || !shippingInfo.city) {
			setPaymentError('Please fill in all required shipping information');
			return;
		}

		setPaymentError(null);
		setStep('payment');
	};

	const createOrders = async (walletInstance: NonNullable<typeof wallet>) => {
		// Check if we need multi-currency orders
		const hasMultipleCurrencies = currencyBreakdown && Object.keys(currencyBreakdown).length > 1;

		// If orders already created, return them
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
			const walletAddress = await walletInstance.getChangeAddress();

			// Step 3: Prepare orders data (always as array, handles both single and multi-currency)
			let ordersData: Array<{
				items: Database.OrderItemInput[];
				token_id?: string | null;
			}>;

			if (hasMultipleCurrencies) {
				// Multi-currency: orders grouped by currency
				ordersData = getOrdersDataFromCart(items, walletAddress).orders;
			} else {
				// Single currency: wrap in array for unified API
				ordersData = [
					{
						items: items.map(item => ({
							product_id: item.productId,
							quantity: item.quantity,
							price: item.product.price,
							token_id: item.product.token_id,
						})),
						token_id: items[0]?.product.token_id || null,
					},
				];
			}

			// Step 4: Create orders using unified function (always returns array)
			const orders = await createOrdersMutation.mutateAsync({
				wallet_address: walletAddress,
				orders: ordersData,
				shipping_info: enableShipping
					? {
							fullName: shippingInfo.fullName,
							email: shippingInfo.email,
							phone: shippingInfo.phone || undefined,
							address: shippingInfo.address,
							city: shippingInfo.city,
							postalCode: shippingInfo.postalCode,
							country: shippingInfo.country,
						}
					: undefined,
			});

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
				await createOrders(wallet);
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

		const orders = await createOrders(wallet);
		if (!orders || orders.length === 0) return;

		setPaymentError(null);

		try {
			// Initialize payment statuses for all orders
			const initialStatuses: CurrencyPaymentStatus[] = orders.map(order => {
				const currencyKey = order.token_id ?? 'ADA';
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

			// Process payments with progress tracking
			const result = await processMultiCurrencyPayments(wallet, paymentsInfo, (orderId, status, paymentResult) => {
				setPaymentStatuses(prev =>
					prev.map(ps => {
						const order = orders.find(o => o.id === orderId);
						if (!order) return ps;

						const currencyKey = order.token_id ?? 'ADA';
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
					const updatedOrder = await updateOrderStatusMutation.mutateAsync({
						orderId: completed.orderId,
						status: 'paid',
						txHash: completed.txHash,
					});
					updateOrderInState(updatedOrder);
				}

				// Set success state
				setStep('confirmation');

				// Call completion callback with first order
				onComplete?.(orders[0].id);
			} else {
				// Handle partial success
				// Update completed orders
				for (const completed of result.completedOrders) {
					const updatedOrder = await updateOrderStatusMutation.mutateAsync({
						orderId: completed.orderId,
						status: 'paid',
						txHash: completed.txHash,
					});
					updateOrderInState(updatedOrder);
				}

				// Update failed orders
				for (const failed of result.failedOrders) {
					const updatedOrder = await updateOrderStatusMutation.mutateAsync({
						orderId: failed.orderId,
						status: 'payment_failed',
						error: failed.error,
					});
					updateOrderInState(updatedOrder);
				}

				setPaymentError(
					`Payment partially completed. ${result.completedOrders.length} of ${orders.length} payments succeeded. Failed: ${result.failedOrders[0]?.error || 'Unknown error'}`,
				);
			}
		} catch (error) {
			console.error('Payment processing failed:', error);
			setPaymentError('Payment processing failed. Please try again.');
		}
	};

	useEffect(() => {
		if (step !== 'confirmation' || hasClearedCartRef.current) return;
		clear();
		hasClearedCartRef.current = true;
	}, [clear, step]);

	const handleRetry = () => {
		setPaymentError(null);
		setPaymentStatuses([]);
		setStep('review');
	};

	const isLoading = createOrdersMutation.isPending || updateOrderStatusMutation.isPending;

	// Show full page skeleton while cart is loading
	if (!cartLoaded) {
		return (
			<div className="max-w-4xl mx-auto p-6">
				<StepIndicatorSkeleton />
				<CheckoutStepSkeleton icon={<div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse" />} itemCount={2} />
			</div>
		);
	}

	if (isEmpty && step !== 'confirmation') {
		return (
			<div className="max-w-2xl mx-auto text-center p-6">
				<h1 className="text-3xl font-bold mb-6">Checkout</h1>
				<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
					<p className="text-yellow-800 mb-4">
						Your cart is empty. Please add items to your cart before proceeding to checkout.
					</p>
					<a
						href="/products"
						className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
					>
						Continue Shopping
					</a>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-4xl mx-auto p-6">
			<StepIndicator
				current={step}
				steps={
					enableShipping
						? [
								{ id: 'review', label: 'Review' },
								{ id: 'shipping', label: 'Shipping' },
								{ id: 'payment', label: 'Payment' },
								{ id: 'confirmation', label: 'Confirmation' },
							]
						: [
								{ id: 'review', label: 'Review' },
								{ id: 'payment', label: 'Payment' },
								{ id: 'confirmation', label: 'Confirmation' },
							]
				}
			/>

			<div className="mt-8">
				{step === 'review' && <ReviewStep total={total} isLoading={isLoading} onProceed={handleProceedToShipping} />}
				{enableShipping && step === 'shipping' && (
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
						onBack={() => setStep(enableShipping ? 'shipping' : 'review')}
						error={paymentError}
						paymentStatuses={paymentStatuses}
					/>
				)}
				{step === 'confirmation' && (
					<ConfirmationStep createdOrders={createdOrders} error={paymentError} onRetry={handleRetry} />
				)}
			</div>
		</div>
	);
}
