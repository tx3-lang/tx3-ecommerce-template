import { Link } from '@tanstack/react-router';

// Components
import { Button } from '@/components/ui/button';

// Lib
import { formatLovelaceToAda } from '@/lib/ada-formatter';
import { cn } from '@/lib/utils';

interface CartSummaryProps {
	subtotal: number;
	total: number;
	itemCount: number;
	compact?: boolean; // For mini-cart display
	showCheckoutButton?: boolean;
	sticky?: boolean;
	className?: string;
	onCheckout?: () => void;
	disabled?: boolean;
}

export function CartSummary({
	subtotal,
	total,
	itemCount,
	compact = false,
	showCheckoutButton = true,
	sticky = false,
	className,
	onCheckout,
	disabled = false,
}: CartSummaryProps) {
	// Compact version for mini-cart
	if (compact) {
		return (
			<div className={cn('border-t border-gray-700 p-4 bg-gray-800', className)}>
				<div className="space-y-2">
					<div className="flex justify-between text-sm">
						<span className="text-gray-300">Subtotal ({itemCount} items):</span>
						<span className="text-white">{formatLovelaceToAda(subtotal, 2)}</span>
					</div>
					<div className="flex justify-between text-sm">
						<span className="text-gray-300">Shipping:</span>
						<span className="text-green-400">Free</span>
					</div>
					<div className="flex justify-between font-semibold pt-2 border-t border-gray-700">
						<span className="text-white">Total:</span>
						<span className="text-white">{formatLovelaceToAda(total, 2)}</span>
					</div>
				</div>

				{showCheckoutButton && (
					<div className="mt-4">
						<Link to="/checkout" disabled={disabled}>
							<Button className="w-full" size="sm" onClick={onCheckout} disabled={disabled}>
								Proceed to Checkout
							</Button>
						</Link>
					</div>
				)}
			</div>
		);
	}

	// Full version for cart page
	return (
		<div className={cn('bg-white border rounded-lg p-6 space-y-4', sticky && 'lg:sticky lg:top-6', className)}>
			<h3 className="text-lg font-semibold">Order Summary</h3>

			<div className="space-y-3">
				<div className="flex justify-between text-sm">
					<span className="text-gray-600">
						Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
					</span>
					<span className="font-medium">{formatLovelaceToAda(subtotal, 2)}</span>
				</div>

				<div className="flex justify-between text-sm">
					<span className="text-gray-600">Shipping</span>
					<span className="text-green-600 font-medium">Free</span>
				</div>

				<div className="flex justify-between text-sm">
					<span className="text-gray-600">Tax</span>
					<span className="font-medium">-</span>
				</div>

				<hr className="my-3" />

				<div className="flex justify-between text-lg font-semibold">
					<span>Total</span>
					<span>{formatLovelaceToAda(total, 2)}</span>
				</div>
			</div>

			{showCheckoutButton && (
				<div className="space-y-3">
					<Link to="/checkout" disabled={itemCount === 0 || disabled}>
						<Button className="w-full" size="lg" disabled={itemCount === 0 || disabled}>
							Proceed to Checkout
						</Button>
					</Link>
				</div>
			)}

			{/* Security Trust Badge */}
			<div className="pt-4 border-t border-gray-200">
				<div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
					<span>🔒</span>
					<span>Secure Cardano Payment</span>
				</div>
			</div>
		</div>
	);
}
