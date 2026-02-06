import { createFileRoute, Link, redirect } from '@tanstack/react-router';

// Components
import { CartItem } from '@/components/cart/CartItem';
import { CartSkeleton } from '@/components/cart/CartSkeleton';
import { CartSummary } from '@/components/cart/CartSummary';
import { EmptyCart } from '@/components/cart/EmptyCart';

// Hooks
import { brandConfig } from '@/config/brand';
import { useCart } from '@/hooks/use-cart';
import { useCartItems } from '@/hooks/use-cart-items';

export const Route = createFileRoute('/(shop)/cart')({
	beforeLoad: () => {
		if (brandConfig.features.disableCartFlow) {
			throw redirect({ to: '/checkout' });
		}
	},
	component: CartPage,
});

function CartPage() {
	const { total, itemCount, updateQuantity, removeItem, isEmpty, isLoaded, refresh, currencyBreakdown } = useCart();
	const { cartItemsWithStock, hasStockIssues, isValidatingStock } = useCartItems({
		enableStockValidation: true,
	});
	const enableShipping = brandConfig.features.enableShipping;
	const productsPath = brandConfig.features.disableProductsPage ? '/' : '/products';

	// Show skeleton while cart is loading
	if (!isLoaded) {
		return <CartSkeleton />;
	}

	return (
		<div className="bg-gray-50">
			<title>Shopping Cart</title>
			<meta name="description" content="Review and manage your shopping cart items" />

			<div className="container mx-auto px-4 py-8">
				{/* Page Header */}
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900 mb-2">Shopping Cart</h1>
					<p className="text-gray-600">
						{itemCount} {itemCount === 1 ? 'item' : 'items'} in your cart
					</p>
				</div>

				{isEmpty ? (
					<EmptyCart />
				) : (
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
						{/* Cart Items Section */}
						<div className="lg:col-span-2">
							<div className="bg-white rounded-lg border">
								{/* Cart Items Header */}
								<div className="p-6 border-b">
									<h2 className="text-lg font-semibold">Items in Cart</h2>
								</div>

								{/* Cart Items List */}
								<div className="divide-y">
									{cartItemsWithStock.map(item => (
										<div key={item.productId} className="p-6">
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

								{/* Cart Footer */}
								{!isEmpty && (
									<div className="p-6 border-t">
										<div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
											<div className="text-sm text-gray-600">
												Need to add more items?{' '}
												<Link to={productsPath} className="text-blue-600 hover:text-blue-700 font-medium underline">
													Continue Shopping
												</Link>
											</div>

											<div className="flex gap-2">
												<button
													type="button"
													onClick={() => refresh()}
													className="text-sm text-gray-600 hover:text-gray-800 underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
												>
													Refresh Cart
												</button>
											</div>
										</div>
									</div>
								)}
							</div>
						</div>

						{/* Order Summary Section */}
						<div className="lg:col-span-1">
							<CartSummary
								currencyBreakdown={currencyBreakdown}
								total={total}
								itemCount={itemCount}
								sticky
								showCheckoutButton
								disabled={hasStockIssues || isValidatingStock}
							/>
						</div>
					</div>
				)}

				{/* Additional Information */}
				{!isEmpty && (
					<div
						className={
							enableShipping
								? 'mt-12 grid grid-cols-1 md:grid-cols-3 gap-6'
								: 'mt-12 grid grid-cols-1 md:grid-cols-2 gap-6'
						}
					>
						{enableShipping && (
							<div className="text-center p-6 bg-white rounded-lg border">
								<div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
									<span className="text-blue-600 text-xl">🚚</span>
								</div>
								<h3 className="font-semibold mb-2">Free Shipping</h3>
								<p className="text-sm text-gray-600">
									Enjoy free shipping on all orders. No minimum purchase required.
								</p>
							</div>
						)}

						<div className="text-center p-6 bg-white rounded-lg border">
							<div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
								<span className="text-green-600 text-xl">🔄</span>
							</div>
							<h3 className="font-semibold mb-2">Easy Returns</h3>
							<p className="text-sm text-gray-600">
								Not satisfied? Return your items within 30 days for a full refund.
							</p>
						</div>

						<div className="text-center p-6 bg-white rounded-lg border">
							<div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
								<span className="text-purple-600 text-xl">🛡️</span>
							</div>
							<h3 className="font-semibold mb-2">Secure Payment</h3>
							<p className="text-sm text-gray-600">
								Your payment information is secure with Cardano blockchain technology.
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
