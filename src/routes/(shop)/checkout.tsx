import { createFileRoute } from '@tanstack/react-router';
import { useId } from 'react';

export const Route = createFileRoute('/(shop)/checkout')({
	component: Checkout,
});

function Checkout() {
	const emailId = useId();

	return (
		<div className="p-8">
			<h1 className="text-3xl font-bold mb-6">Checkout</h1>
			<p className="text-muted-foreground mb-8">Complete your purchase with Cardano wallet payment.</p>

			<div className="max-w-2xl mx-auto">
				<div className="space-y-6">
					{/* Order Summary */}
					<div className="border rounded-lg p-6">
						<h2 className="text-xl font-semibold mb-4">Order Summary</h2>
						<div className="space-y-2 mb-4">
							<div className="flex justify-between">
								<span>Product 1</span>
								<span>50 ADA</span>
							</div>
							<div className="flex justify-between">
								<span>Product 2</span>
								<span>30 ADA</span>
							</div>
							<div className="border-t pt-2 flex justify-between font-bold">
								<span>Total</span>
								<span>80 ADA</span>
							</div>
						</div>
					</div>

					{/* Customer Information */}
					<div className="border rounded-lg p-6">
						<h2 className="text-xl font-semibold mb-4">Contact Information</h2>
						<div className="space-y-4">
							<div>
								<label htmlFor={emailId} className="block text-sm font-medium mb-2">
									Email (optional)
								</label>
								<input
									type="email"
									id={emailId}
									className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
									placeholder="your@email.com"
								/>
							</div>
						</div>
					</div>

					{/* Payment */}
					<div className="border rounded-lg p-6">
						<h2 className="text-xl font-semibold mb-4">Payment</h2>
						<p className="text-muted-foreground mb-4">Connect your Cardano wallet to complete the payment.</p>
						<button
							type="button"
							className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
						>
							Connect Wallet
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
