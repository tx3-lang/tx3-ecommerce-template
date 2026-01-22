import { IconCheck, IconClock, IconPackage } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';

// Components
import { Spinner } from '@/components/ui/spinner';

// Hooks
import { useOrder } from '@/hooks/use-orders';

// Lib
import { formatLovelaceToAda } from '@/lib/ada-formatter';

export const Route = createFileRoute('/order-confirmation/$orderId')({
	component: OrderConfirmation,
});

function OrderConfirmation() {
	const { orderId } = Route.useParams();
	const { data: order, isLoading, error } = useOrder(orderId);

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
						href="/products"
						className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
					>
						Back to Products
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
											<p className="font-semibold">{formatLovelaceToAda(item.price_lovelace, 2)}</p>
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
									<span className="font-medium">{formatLovelaceToAda(order.total_lovelace, 2)}</span>
								</div>

								<div className="flex justify-between text-sm">
									<span className="text-gray-600">Shipping</span>
									<span className="font-medium">Free</span>
								</div>

								<div className="border-t pt-3">
									<div className="flex justify-between">
										<span className="font-semibold">Total</span>
										<span className="font-bold text-lg">{formatLovelaceToAda(order.total_lovelace, 2)}</span>
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
										<p className="font-mono text-xs bg-white p-2 rounded border">{order.cardano_tx_hash}</p>
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
							href="/products"
							className="flex-1 inline-flex items-center justify-center px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
						>
							Continue Shopping
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
