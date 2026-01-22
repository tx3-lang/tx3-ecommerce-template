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
import { useCreateOrder, useUpdateOrderStatus } from '@/hooks/use-orders';
import { useWallet } from '@/hooks/use-wallet';

// Lib
import { processCardanoPayment } from '@/lib/cardano-payment';

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
	const [shippingInfo, setShippingInfo] = useState<ShippingInfo>({
		fullName: '',
		email: '',
		phone: '',
		address: '',
		city: '',
		postalCode: '',
		country: '',
	});

	const { items, total, clear, isLoaded: cartLoaded } = useCart();
	const { wallet, isConnected, connect } = useWallet();
	const createOrderMutation = useCreateOrder();
	const updateOrderStatusMutation = useUpdateOrderStatus();

	const handleProceedToShipping = () => {
		setStep('shipping');
	};

	const handleProceedToPayment = async () => {
		// Validate shipping info
		if (!shippingInfo.fullName || !shippingInfo.email || !shippingInfo.address || !shippingInfo.city) {
			setPaymentError('Please fill in all required shipping information');
			return;
		}

		if (!isConnected || !wallet) {
			setStep('payment');
			return;
		}

		try {
			// Get wallet address
			const walletAddress = await wallet.getChangeAddress();

			// Create order first
			const orderData = {
				wallet_address: walletAddress,
				items: items.map(item => ({
					product_id: item.productId,
					quantity: item.quantity,
					price_lovelace: item.product.price_lovelace,
				})),
				total_lovelace: total,
			};

			const order = await createOrderMutation.mutateAsync(orderData);
			setCreatedOrder(order);
			setStep('payment');
		} catch (error) {
			console.error('Failed to create order:', error);
			setPaymentError('Failed to create order. Please try again.');
		}
	};

	const handleWalletConnect = async (walletName: string) => {
		try {
			await connect(walletName);
			setPaymentError(null);
		} catch (error) {
			console.error('Failed to connect wallet:', error);
			setPaymentError('Failed to connect wallet. Please try again.');
		}
	};

	const handlePayment = async () => {
		if (!createdOrder || !wallet) return;

		setPaymentError(null);

		try {
			// Process payment with timeout
			const paymentResult = await processCardanoPayment(wallet, createdOrder);

			if (paymentResult.success && paymentResult.txHash) {
				// Update order status to paid
				await updateOrderStatusMutation.mutateAsync({
					orderId: createdOrder.id,
					status: 'paid',
					txHash: paymentResult.txHash,
				});

				// Clear cart
				clear();

				// Set success state
				setStep('confirmation');

				// Call completion callback
				onComplete?.(createdOrder.id);
			} else {
				// Update order status to failed
				await updateOrderStatusMutation.mutateAsync({
					orderId: createdOrder.id,
					status: 'payment_failed',
					error: paymentResult.error || 'Payment failed',
				});

				setPaymentError(paymentResult.error || 'Payment failed');
			}
		} catch (error) {
			console.error('Payment processing failed:', error);
			setPaymentError('Payment processing failed. Please try again.');
		}
	};

	const handleRetry = () => {
		setPaymentError(null);
		setStep('review');
	};

	const isLoading = createOrderMutation.isPending || updateOrderStatusMutation.isPending;

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
						isConnected={isConnected}
						isLoading={isLoading}
						onWalletConnect={handleWalletConnect}
						onPayment={handlePayment}
						onBack={() => setStep('shipping')}
						error={paymentError}
					/>
				)}
				{step === 'confirmation' && (
					<ConfirmationStep total={total} createdOrder={createdOrder} error={paymentError} onRetry={handleRetry} />
				)}
			</div>
		</div>
	);
}
