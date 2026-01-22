import { createFileRoute } from '@tanstack/react-router';

// Components
import { CheckoutFlow } from '@/components/CheckoutFlow';

// Hooks
import { useCart } from '@/hooks/use-cart';

export const Route = createFileRoute('/(shop)/checkout')({
	component: Checkout,
});

function Checkout() {
	const { isEmpty, isLoaded } = useCart();

	// Show loading skeleton while cart is loading
	if (!isLoaded) {
		return (
			<div className="bg-gray-50 min-h-screen">
				<title>Loading Checkout...</title>
				<meta name="description" content="Loading checkout" />
				<div className="container mx-auto px-4 py-8">
					<CheckoutFlow />
				</div>
			</div>
		);
	}

	// Check if cart has items before allowing checkout
	if (isEmpty) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="max-w-2xl mx-auto text-center">
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
			</div>
		);
	}

	return (
		<div className="bg-gray-50 min-h-screen">
			<title>Checkout - Complete Your Order</title>
			<meta name="description" content="Complete your purchase with our secure checkout process" />

			<div className="container mx-auto px-4 py-8">
				<CheckoutFlow />
			</div>
		</div>
	);
}
