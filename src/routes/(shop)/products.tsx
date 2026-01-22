import { createFileRoute } from '@tanstack/react-router';

// Components
import { ProductCard } from '@/components/ProductCard';

// Hooks
import { useCart } from '@/hooks/use-cart';
import { useProducts } from '@/hooks/use-products';

export const Route = createFileRoute('/(shop)/products')({
	component: ProductsPage,
});

function ProductsPage() {
	const { data: products, isLoading, error } = useProducts();
	const { addItem, getItemQuantity } = useCart();

	const handleAddToCart = (product: Database.Product) => {
		addItem(product.id, 1, product);
	};

	// Loading state
	if (isLoading) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold mb-4">Our Products</h1>
					<p className="text-gray-600">Loading products...</p>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{[1, 2, 3, 4, 5, 6].map(i => (
						<div key={i} className="animate-pulse">
							<div className="bg-gray-200 h-64 rounded-lg mb-4"></div>
							<div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
							<div className="h-4 bg-gray-200 rounded w-1/2"></div>
						</div>
					))}
				</div>
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold mb-4">Our Products</h1>
					<p className="text-red-600">Error loading products. Please try again later.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-8">
				<h1 className="text-3xl font-bold mb-4">Our Products</h1>
				<p className="text-gray-600">
					Browse our collection of premium products available for purchase with Cardano ADA and tokens.
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{products?.map(product => (
					<ProductCard
						key={product.id}
						product={product}
						variant="detailed"
						showAddToCart={true}
						onAddToCart={handleAddToCart}
						itemsInCart={getItemQuantity(product.id)}
					/>
				))}
			</div>
		</div>
	);
}
