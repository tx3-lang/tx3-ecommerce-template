import { IconAlertCircle, IconMapPin } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { memo } from 'react';

// Components
import { CartItem } from '@/components/cart/CartItem';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Hooks
import { useCart } from '@/hooks/use-cart';
import { useCartItems } from '@/hooks/use-cart-items';

// Lib
import { formatLovelaceToAda } from '@/lib/ada-formatter';

interface ReviewStepProps {
	total: number;
	isLoading: boolean;
	onProceed: () => void;
}

function ReviewStepComponent({ total, isLoading, onProceed }: ReviewStepProps) {
	const navigate = useNavigate();
	const { items, updateQuantity, removeItem } = useCart();
	const { cartItemsWithStock, hasStockIssues, isCheckoutBlocked } = useCartItems({
		enableStockValidation: true,
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<IconMapPin className="w-6 h-6 text-blue-600" />
				<h2 className="text-2xl font-bold">Review Order</h2>
			</div>

			{/* Stock Issues Alert */}
			{hasStockIssues && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-4">
					<div className="flex items-start space-x-2">
						<IconAlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
						<div>
							<h4 className="text-red-800 font-medium mb-1">Stock Issues Detected</h4>
							<p className="text-red-700 text-sm">
								Some items in your cart have insufficient stock. Please adjust quantities or remove unavailable items
								before proceeding.
							</p>
						</div>
					</div>
				</div>
			)}

			{/* Order Items */}
			<div className="bg-white border rounded-lg p-6">
				<h3 className="font-semibold mb-4">Order Items</h3>
				<div className="space-y-4">
					{cartItemsWithStock.map(item => (
						<div key={item.productId} className="relative">
							<CartItem item={item} onQuantityChange={updateQuantity} onRemove={removeItem} />
							{item.hasStockIssue && (
								<div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
									<p className="text-red-600 text-sm font-medium">
										{item.stockInfo?.currentStock === 0
											? 'Out of stock'
											: `Only ${item.stockInfo?.currentStock} available (you requested ${item.quantity})`}
									</p>
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Order Summary */}
			<div className="bg-white border rounded-lg p-6">
				<h3 className="font-semibold mb-4">Order Summary</h3>
				<div className="space-y-3">
					<div className="flex justify-between text-sm">
						<span>Subtotal ({items.length} items)</span>
						<span>{formatLovelaceToAda(total, 2)}</span>
					</div>
					<div className="flex justify-between text-sm">
						<span>Shipping</span>
						<span className="text-green-600">Free</span>
					</div>
					<div className="flex justify-between text-sm">
						<span>Tax</span>
						<span>-</span>
					</div>
					<div className="border-t pt-3">
						<div className="flex justify-between text-lg font-semibold">
							<span>Total</span>
							<span>{formatLovelaceToAda(total, 2)}</span>
						</div>
					</div>
				</div>
			</div>

			<div className="flex justify-between">
				<Button variant="outline" onClick={() => navigate({ to: '/cart' })} disabled={isLoading}>
					Back to Cart
				</Button>
				<Button onClick={onProceed} disabled={isLoading || items.length === 0 || isCheckoutBlocked}>
					{isLoading ? <Spinner /> : null}
					{isCheckoutBlocked ? 'Cannot Proceed' : 'Proceed to Shipping'}
				</Button>
			</div>
		</div>
	);
}

export const ReviewStep = memo(ReviewStepComponent);
