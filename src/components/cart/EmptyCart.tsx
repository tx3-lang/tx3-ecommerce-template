import { IconPackage, IconShoppingCart } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

// Components
import { Button } from '@/components/ui/button';

// Config
import { brandConfig } from '@/config/brand';

// Lib
import { cn } from '@/lib/utils';

interface EmptyCartProps {
	compact?: boolean; // For mini-cart display
	className?: string;
}

export function EmptyCart({ compact = false, className }: EmptyCartProps) {
	const productsPath = brandConfig.features.disableProductsPage ? '/' : '/products';

	// Compact version for mini-cart
	if (compact) {
		return (
			<div className={cn('text-center py-6 px-4', className)}>
				<div className="w-12 h-12 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
					<IconShoppingCart size={20} className="text-gray-400" />
				</div>
				<p className="text-sm font-medium text-white mb-1">Your cart is empty</p>
				<p className="text-xs text-gray-400 mb-4">Add items to get started</p>
				<Link to={productsPath}>
					<Button size="sm" className="w-full">
						Browse Products
					</Button>
				</Link>
			</div>
		);
	}

	// Full version for cart page
	return (
		<div className={cn('text-center py-16 px-6', className)}>
			<div className="max-w-lg mx-auto">
				{/* Empty Cart Illustration */}
				<div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
					<IconShoppingCart size={40} className="text-gray-400" />
				</div>

				{/* Empty Cart Message */}
				<h2 className="text-2xl font-bold text-gray-900 mb-4">Your Cart is Empty</h2>

				<p className="text-lg text-gray-600 mb-8">
					Looks like you haven't added any products to your cart yet.
					<br />
					Browse our collection and find something perfect for you!
				</p>

				{/* Action Buttons */}
				<div className="flex flex-col sm:flex-row gap-4 justify-center">
					<Link to={productsPath}>
						<Button size="lg" className="w-full sm:w-auto">
							<IconPackage size={20} className="mr-2" />
							Browse Products
						</Button>
					</Link>

					<Link to="/">
						<Button variant="outline" size="lg" className="w-full sm:w-auto">
							Continue Shopping
						</Button>
					</Link>
				</div>

				{/* Trust Indicators */}
				<div className="mt-12 grid grid-cols-3 gap-8">
					<div className="text-center">
						<div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
							<span className="text-blue-600 text-xl">🛡️</span>
						</div>
						<p className="text-sm font-medium text-gray-900">Secure Payment</p>
						<p className="text-xs text-gray-600">Cardano blockchain</p>
					</div>

					<div className="text-center">
						<div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
							<span className="text-green-600 text-xl">🚚</span>
						</div>
						<p className="text-sm font-medium text-gray-900">Fast Delivery</p>
						<p className="text-xs text-gray-600">Quick processing</p>
					</div>

					<div className="text-center">
						<div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
							<span className="text-purple-600 text-xl">💎</span>
						</div>
						<p className="text-sm font-medium text-gray-900">Quality Products</p>
						<p className="text-xs text-gray-600">Curated selection</p>
					</div>
				</div>
			</div>
		</div>
	);
}
