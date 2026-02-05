import { createFileRoute } from '@tanstack/react-router';

// Components
import { CheckoutFlow } from '@/components/CheckoutFlow';

// Hooks
import { useCart } from '@/hooks/use-cart';

export const Route = createFileRoute('/(shop)/checkout')({
	component: Checkout,
});

function Checkout() {
	const { isLoaded } = useCart();

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
