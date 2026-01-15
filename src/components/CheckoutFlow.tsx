import { IconAlertCircle, IconCheck, IconLoader2, IconWallet } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
// Hooks
import { useCart } from '@/hooks/use-cart';
import { useCreateOrder, useUpdateOrderStatus } from '@/hooks/use-orders';
import { useWallet } from '@/hooks/use-wallet';
import { formatLovelaceToAda, processCardanoPayment } from '@/lib/cardano-payment';
// Components
import { StepIndicator } from './StepIndicator';
import { Button } from './ui/button';

type CheckoutStep = 'review' | 'wallet' | 'payment' | 'result';

interface CheckoutFlowProps {
	onComplete?: (orderId: string) => void;
}

export function CheckoutFlow({ onComplete }: CheckoutFlowProps) {
	const navigate = useNavigate();
	const [step, setStep] = useState<CheckoutStep>('review');
	const [paymentError, setPaymentError] = useState<string | null>(null);
	const [createdOrder, setCreatedOrder] = useState<Database.Order | null>(null);

	const { items, total, clear } = useCart();
	const { wallet, isConnected, connect } = useWallet();
	const createOrderMutation = useCreateOrder();
	const updateOrderStatusMutation = useUpdateOrderStatus();

	const handleProceedToPayment = async () => {
		if (!isConnected || !wallet) {
			setStep('wallet');
			return;
		}

		try {
			// Get wallet address
			const walletAddress = await wallet.getChangeAddress();

			// Create order first
			const orderData = {
				wallet_address: walletAddress,
				items: items.map((item) => ({
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
			setStep('review');
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
				setStep('result');

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

	const renderReviewStep = () => (
		<div className="space-y-6">
			<h2 className="text-2xl font-bold">Review Order</h2>

			{/* Order Items */}
			<div className="space-y-4">
				{items.map((item) => (
					<div key={item.productId} className="flex items-center justify-between p-4 border rounded-lg">
						<div className="flex-1">
							<h3 className="font-semibold">{item.product.name}</h3>
							<p className="text-sm text-gray-600">Qty: {item.quantity}</p>
						</div>
						<div className="text-right">
							<p className="font-semibold">{formatLovelaceToAda(item.subtotal)} ADA</p>
							<p className="text-sm text-gray-600">{formatLovelaceToAda(item.product.price_lovelace)} ADA each</p>
						</div>
					</div>
				))}
			</div>

			{/* Total */}
			<div className="border-t pt-4">
				<div className="flex justify-between items-center">
					<span className="text-lg font-semibold">Total:</span>
					<span className="text-2xl font-bold">{formatLovelaceToAda(total)} ADA</span>
				</div>
			</div>

			{/* Wallet Status */}
			<div className="p-4 bg-gray-50 rounded-lg">
				<div className="flex items-center space-x-2">
					<IconWallet className="w-5 h-5" />
					<span>
						Wallet:{' '}
						{isConnected ? (
							<span className="text-green-600 font-medium">Connected</span>
						) : (
							<span className="text-red-600 font-medium">Not Connected</span>
						)}
					</span>
				</div>
			</div>

			<Button
				onClick={handleProceedToPayment}
				disabled={isLoading || items.length === 0}
				className="w-full"
				type="button"
			>
				{isLoading ? <IconLoader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
				Proceed to Payment
			</Button>
		</div>
	);

	const renderWalletStep = () => (
		<div className="space-y-6 text-center">
			<div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
				<IconWallet className="w-8 h-8 text-gray-600" />
			</div>

			<h2 className="text-2xl font-bold">Connect Wallet</h2>
			<p className="text-gray-600">Connect your Cardano wallet to proceed with payment</p>

			<div className="space-y-2">
				<Button onClick={() => handleWalletConnect('eternl')} disabled={isLoading} type="button" className="w-full">
					{isLoading ? <IconLoader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
					Connect Eternl
				</Button>
				<Button
					onClick={() => handleWalletConnect('nami')}
					disabled={isLoading}
					type="button"
					variant="outline"
					className="w-full"
				>
					{isLoading ? <IconLoader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
					Connect Nami
				</Button>
			</div>

			<button onClick={() => setStep('review')} className="text-gray-600 hover:text-gray-800 underline" type="button">
				Back to Order Review
			</button>
		</div>
	);

	const renderPaymentStep = () => (
		<div className="space-y-6">
			<h2 className="text-2xl font-bold">Complete Payment</h2>

			<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
				<div className="flex items-start space-x-2">
					<IconAlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
					<div>
						<p className="font-medium text-yellow-800">Payment Required</p>
						<p className="text-sm text-yellow-700">
							Please approve the payment request in your wallet. You have 60 seconds to complete the transaction.
						</p>
					</div>
				</div>
			</div>

			<div className="p-4 border rounded-lg">
				<h3 className="font-semibold mb-2">Payment Details</h3>
				<div className="space-y-2 text-sm">
					<div className="flex justify-between">
						<span>Amount:</span>
						<span className="font-medium">{formatLovelaceToAda(total)} ADA</span>
					</div>
				</div>
			</div>

			<Button onClick={handlePayment} disabled={isLoading} className="w-full" type="button">
				{isLoading ? <IconLoader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
				Pay {formatLovelaceToAda(total)} ADA
			</Button>
		</div>
	);

	const renderResultStep = () => (
		<div className="space-y-6 text-center">
			<div
				className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
					paymentError ? 'bg-red-100' : 'bg-green-100'
				}`}
			>
				{paymentError ? (
					<IconAlertCircle className="w-8 h-8 text-red-600" />
				) : (
					<IconCheck className="w-8 h-8 text-green-600" />
				)}
			</div>

			<h2 className="text-2xl font-bold">{paymentError ? 'Payment Failed' : 'Payment Successful!'}</h2>

			{paymentError ? (
				<div className="space-y-4">
					<div className="p-4 bg-red-50 border border-red-200 rounded-lg text-left">
						<p className="text-red-800">{paymentError}</p>
					</div>

					<Button onClick={handleRetry} variant="outline" className="w-full" type="button">
						Try Again
					</Button>
				</div>
			) : (
				<div className="space-y-4">
					<p className="text-gray-600">Thank you for your order! Your payment has been processed successfully.</p>

					{createdOrder && (
						<div className="p-4 bg-gray-50 rounded-lg">
							<p className="text-sm text-gray-600">Order ID: {createdOrder.id}</p>
						</div>
					)}

					<Button onClick={() => navigate({ to: '/products' })} className="w-full" type="button">
						Continue Shopping
					</Button>
				</div>
			)}
		</div>
	);

	return (
		<div className="max-w-4xl mx-auto p-6">
			<StepIndicator
				current={step}
				steps={[
					{ id: 'review', label: 'Review' },
					{ id: 'wallet', label: 'Wallet' },
					{ id: 'payment', label: 'Payment' },
					{ id: 'result', label: 'Complete' },
				]}
			/>

			<div className="mt-8">
				{step === 'review' && renderReviewStep()}
				{step === 'wallet' && renderWalletStep()}
				{step === 'payment' && renderPaymentStep()}
				{step === 'result' && renderResultStep()}
			</div>
		</div>
	);
}
