import { IconCheck } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { memo } from 'react';

// Components
import { Button } from '@/components/ui/button';

// Lib
import { formatPriceSyncById } from '@/lib/unified-formatter';

interface ConfirmationStepProps {
	createdOrders: Database.Order[];
	error?: string | null;
	onRetry: () => void;
}

function ConfirmationStepComponent({ createdOrders, error, onRetry }: ConfirmationStepProps) {
	const navigate = useNavigate();
	const hasOrders = createdOrders.length > 0;

	return (
		<div className="space-y-6 text-center">
			<div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
				<IconCheck className="w-8 h-8 text-green-600" />
			</div>

			<h2 className="text-2xl font-bold">Order Confirmation</h2>

			{error ? (
				<div className="space-y-4">
					<div className="p-4 bg-red-50 border border-red-200 rounded-lg text-left">
						<p className="text-red-800">{error}</p>
					</div>

					<Button onClick={onRetry} variant="outline" className="w-full">
						Try Again
					</Button>
				</div>
			) : (
				<div className="space-y-4">
					<p className="text-gray-600">Thank you for your order! Your payment has been processed successfully.</p>

					{hasOrders && (
						<div className="space-y-4 text-left">
							<h3 className="font-semibold">Order Details</h3>
							{createdOrders.map(order => (
								<div key={order.id} className="p-4 bg-gray-50 rounded-lg space-y-3">
									<div className="flex items-start justify-between gap-4">
										<div>
											<p className="text-sm text-gray-500">Order ID</p>
											<p className="font-mono text-sm break-all">{order.id}</p>
										</div>
										<Button
											variant="outline"
											onClick={() => navigate({ to: '/order-confirmation/$orderId', params: { orderId: order.id } })}
										>
											View Details
										</Button>
									</div>
									<div className="space-y-2 text-sm">
										<div className="flex justify-between">
											<span>Total Amount:</span>
											<span className="font-semibold">
												{formatPriceSyncById(order.total_amount, order.token_id, {
													compact: false,
													supportedToken: order.supported_tokens,
												})}
											</span>
										</div>
										<div className="flex justify-between">
											<span>Tx Hash:</span>
											<span className="font-mono text-xs break-all">{order.cardano_tx_hash || 'Not available'}</span>
										</div>
										<div className="flex justify-between">
											<span>Status:</span>
											<span className="text-green-600 font-medium">Paid</span>
										</div>
									</div>
								</div>
							))}
						</div>
					)}

					{!hasOrders && (
						<div className="p-4 bg-gray-50 rounded-lg text-left">
							<h3 className="font-semibold mb-3">Order Details</h3>
							<p className="text-sm text-gray-600">We could not load your order details. Please try again.</p>
						</div>
					)}

					<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-left">
						<h3 className="font-semibold mb-2">What's Next?</h3>
						<ul className="text-sm text-gray-700 space-y-1">
							<li>• You'll receive a confirmation email shortly</li>
							<li>• We'll process your order within 1-2 business days</li>
							<li>• You'll receive tracking information once shipped</li>
						</ul>
					</div>

					<div className="flex gap-4">
						<Button onClick={() => navigate({ to: '/products' })} className="flex-1">
							Continue Shopping
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

export const ConfirmationStep = memo(ConfirmationStepComponent);
