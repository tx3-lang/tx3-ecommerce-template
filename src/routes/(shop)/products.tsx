import { createFileRoute } from '@tanstack/react-router';

// Components
import { type Product, ProductCard } from '@/components/ProductCard';

export const Route = createFileRoute('/(shop)/products')({
	component: ProductsPage,
});

function ProductsPage() {
	// Mock products data
	const products: Product[] = [
		{
			id: '1',
			name: 'Premium Wireless Headphones',
			description: 'Experience crystal-clear audio with active noise cancellation and 30-hour battery life.',
			price: 85.5,
			image: '🎧',
			category: 'Electronics',
			rating: 4.5,
			reviews: 128,
			stock: 15,
		},
		{
			id: '2',
			name: 'Smart Fitness Watch',
			description: 'Track your health and fitness goals with this advanced smartwatch featuring heart rate monitoring.',
			price: 120.0,
			image: '⌚',
			category: 'Electronics',
			rating: 4.8,
			reviews: 89,
			stock: 8,
		},
		{
			id: '3',
			name: 'Organic Coffee Beans',
			description: 'Premium organic coffee beans sourced from sustainable farms. Rich, aromatic flavor profile.',
			price: 45.75,
			image: '☕',
			category: 'Food & Beverage',
			rating: 4.3,
			reviews: 67,
			stock: 25,
		},
		{
			id: '4',
			name: 'Ergonomic Office Chair',
			description: 'Comfortable ergonomic office chair with lumbar support and adjustable height for all-day comfort.',
			price: 250.0,
			image: '🪑',
			category: 'Furniture',
			rating: 4.6,
			reviews: 45,
			stock: 12,
		},
		{
			id: '5',
			name: 'Yoga Mat Premium',
			description: 'Non-slip premium yoga mat with extra cushioning. Perfect for all yoga and exercise routines.',
			price: 35.0,
			image: '🧘',
			category: 'Sports',
			rating: 4.7,
			reviews: 156,
			stock: 30,
		},
		{
			id: '6',
			name: 'Wireless Charging Pad',
			description: 'Fast wireless charging pad compatible with all Qi-enabled devices. Sleek and minimalist design.',
			price: 28.5,
			image: '📱',
			category: 'Electronics',
			rating: 4.2,
			reviews: 93,
			stock: 18,
		},
	];

	const handleAddToCart = (product: Product) => {
		console.log(`Adding ${product.name} to cart`);
	};

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-8">
				<h1 className="text-3xl font-bold mb-4">Our Products</h1>
				<p className="text-gray-600">
					Browse our collection of premium products available for purchase with Cardano ADA and tokens.
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{products.map((product) => (
					<ProductCard
						key={product.id}
						product={product}
						variant="detailed"
						showAddToCart={true}
						onAddToCart={handleAddToCart}
					/>
				))}
			</div>
		</div>
	);
}
