import { IconCheck, IconClock, IconPackage, IconWallet } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';

// Components
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Config
import { brandConfig } from '@/config/brand';

// Hooks
import { useOrder } from '@/hooks/use-orders';
import { useWallet } from '@/hooks/use-wallet';

// Lib
import { formatPriceSyncById } from '@/lib/unified-formatter';

export const Route = createFileRoute('/order-confirmation/$orderId')({
	component: OrderConfirmation,
});

function OrderConfirmation() {
	const { orderId } = Route.useParams();
	const { isConnected, connect, availableWallets, connecting, walletAddress } = useWallet();
	const { data: order, isLoading, error } = useOrder(orderId, walletAddress ?? undefined);
	const isWalletReady = isConnected && !!walletAddress;
	const enableShipping = brandConfig.features.enableShipping;
	const hasProductsPage = !brandConfig.features.disableProductsPage;
	const productsPath = hasProductsPage ? '/products' : '/';

	if (!isWalletReady) {
		return (
			<div className="min-h-screen bg-gray-50 py-8">
				<div className="container mx-auto px-4 max-w-3xl">
					<div className="bg-white rounded-lg shadow-sm p-6">
						<div className="flex items-start gap-4">
							<div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
								<IconWallet className="w-6 h-6 text-blue-600" />
							</div>
							<div className="flex-1">
								<h1 className="text-xl font-bold text-gray-900">Connect your wallet</h1>
								<p className="text-gray-600 mt-1">Connect your Cardano wallet to view this order.</p>
								{orderId ? (
									<p className="text-sm text-gray-500 mt-2">
										Order ID: <span className="font-mono">{orderId}</span>
									</p>
								) : null}
							</div>
						</div>

						<div className="mt-6 space-y-3">
							{availableWallets.length === 0 ? (
								<p className="text-sm text-gray-500">
									No Cardano wallets detected. Please install a wallet extension to continue.
								</p>
							) : (
								availableWallets.map(walletKey => {
									const walletInfo = typeof window !== 'undefined' ? window.cardano?.[walletKey] : null;
									if (!walletInfo) return null;

									return (
										<Button
											key={walletKey}
											onClick={() => connect(walletKey)}
											disabled={connecting}
											variant="outline"
											className="w-full justify-between"
										>
											<span className="flex items-center gap-2">
												{connecting ? <Spinner /> : null}
												Connect {walletInfo.name || walletKey}
											</span>
											<img src={walletInfo.icon} className="h-5" alt={`Icon wallet ${walletInfo.name || walletKey}`} />
										</Button>
									);
								})
							)}
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<Spinner className="size-12 mx-auto mb-4" />
					<p className="text-gray-600">Loading order details...</p>
				</div>
			</div>
		);
	}

	if (error || !order) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
						<IconClock className="w-8 h-8 text-red-600" />
					</div>
					<h1 className="text-2xl font-bold text-gray-900 mb-2">Order Not Found</h1>
					<p className="text-gray-600 mb-6">We couldn't find the order you're looking for.</p>
					<a
						href={productsPath}
						className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
					>
						{hasProductsPage ? 'Back to Products' : 'Back to Home'}
					</a>
				</div>
			</div>
		);
	}

	const isPaid =
		order.status === 'paid' ||
		order.status === 'processing' ||
		order.status === 'shipped' ||
		order.status === 'completed';
	const isFailed = order.status === 'payment_failed' || order.status === 'cancelled';

	return (
		<div className="min-h-screen bg-gray-50 py-8">
			<div className="container mx-auto px-4 max-w-4xl">
				{/* Order Header */}
				<div className="bg-white rounded-lg shadow-sm p-6 mb-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-gray-900 mb-1">Order Confirmation</h1>
							<p className="text-gray-600">
								Order ID: <span className="font-mono text-sm">{orderId}</span>
							</p>
							<p className="text-sm text-gray-500">Placed on {new Date(order.created_at).toLocaleDateString()}</p>
						</div>

						<div
							className={`w-16 h-16 rounded-full flex items-center justify-center ${
								isPaid ? 'bg-green-100' : isFailed ? 'bg-red-100' : 'bg-yellow-100'
							}`}
						>
							{isPaid ? (
								<IconCheck className="w-8 h-8 text-green-600" />
							) : isFailed ? (
								<IconClock className="w-8 h-8 text-red-600" />
							) : (
								<IconClock className="w-8 h-8 text-yellow-600" />
							)}
						</div>
					</div>
				</div>

				<div className="grid md:grid-cols-3 gap-6">
					{/* Order Items */}
					<div className="md:col-span-2">
						<div className="bg-white rounded-lg shadow-sm p-6">
							<h2 className="text-lg font-semibold mb-4">Order Items</h2>

							<div className="space-y-4">
								{order.order_items?.map(item => (
									<div key={item.id} className="flex items-center space-x-4 pb-4 border-b last:border-0">
										<div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
											<IconPackage className="w-8 h-8 text-gray-600" />
										</div>

										<div className="flex-1">
											<h3 className="font-medium text-gray-900">
												{item.products?.name || `Product ${item.product_id}`}
											</h3>
											<p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
										</div>

										<div className="text-right">
											<p className="font-semibold">
												{formatPriceSyncById(item.price, order.token_id, {
													supportedToken: order.supported_tokens,
												})}
											</p>
											<p className="text-sm text-gray-600">each</p>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>

					{/* Order Summary */}
					<div>
						<div className="bg-white rounded-lg shadow-sm p-6">
							<h2 className="text-lg font-semibold mb-4">Order Summary</h2>

							<div className="space-y-3">
								<div className="flex justify-between text-sm">
									<span className="text-gray-600">Subtotal</span>
									<span className="font-medium">
										{formatPriceSyncById(order.total_amount, order.token_id, {
											supportedToken: order.supported_tokens,
										})}
									</span>
								</div>

								{enableShipping && (
									<div className="flex justify-between text-sm">
										<span className="text-gray-600">Shipping</span>
										<span className="font-medium">Free</span>
									</div>
								)}

								<div className="border-t pt-3">
									<div className="flex justify-between">
										<span className="font-semibold">Total</span>
										<span className="font-bold text-lg">
											{formatPriceSyncById(order.total_amount, order.token_id, {
												supportedToken: order.supported_tokens,
											})}
										</span>
									</div>
								</div>
							</div>

							<div className="mt-6 p-4 bg-gray-50 rounded-lg">
								<h3 className="font-medium mb-2">Payment Status</h3>
								<div
									className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
										isPaid
											? 'bg-green-100 text-green-800'
											: isFailed
												? 'bg-red-100 text-red-800'
												: 'bg-yellow-100 text-yellow-800'
									}`}
								>
									{order.status.replace('_', ' ').toUpperCase()}
								</div>

								{order.cardano_tx_hash && (
									<div className="mt-3">
										<p className="text-sm text-gray-600 mb-1">Transaction Hash:</p>
										<p className="font-mono text-xs bg-white p-2 rounded border truncate">{order.cardano_tx_hash}</p>
									</div>
								)}

								{order.payment_error && (
									<div className="mt-3">
										<p className="text-sm text-red-600">{order.payment_error}</p>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>

				{/* Actions */}
				<div className="mt-6 bg-white rounded-lg shadow-sm p-6">
					<div className="flex flex-col sm:flex-row gap-4">
						<a
							href={productsPath}
							className="flex-1 inline-flex items-center justify-center px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
						>
							{hasProductsPage ? 'Continue Shopping' : 'Back to Home'}
						</a>

						{isPaid && (
							<button
								type="button"
								onClick={() => window.print()}
								className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
							>
								Print Receipt
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
