import { createFileRoute, Link } from '@tanstack/react-router';

// Components
import { type Product, ProductCard } from '@/components/ProductCard';

// Helpers
import { generateMetaTags } from '@/lib/seo';

export const Route = createFileRoute('/')({
	component: HomePage,
	head: () => {
		const metaTags = generateMetaTags();

		return {
			meta: metaTags,
		};
	},
});

function HomePage() {
	// Featured products data
	const featuredProducts: Product[] = [
		{
			id: '1',
			name: 'Premium Wireless Headphones',
			description: 'Experience crystal-clear audio with active noise cancellation',
			price: 85.5,
			image: '🎧',
			category: 'Electronics',
			rating: 4.5,
		},
		{
			id: '2',
			name: 'Smart Fitness Watch',
			description: 'Track your health and fitness goals with heart rate monitoring',
			price: 120.0,
			image: '⌚',
			category: 'Electronics',
			rating: 4.8,
		},
		{
			id: '3',
			name: 'Organic Coffee Beans',
			description: 'Premium organic coffee beans from sustainable farms',
			price: 45.75,
			image: '☕',
			category: 'Food & Beverage',
			rating: 4.3,
		},
		{
			id: '4',
			name: 'Ergonomic Office Chair',
			description: 'Comfortable office chair with lumbar support',
			price: 250.0,
			image: '🪑',
			category: 'Furniture',
			rating: 4.6,
		},
	];

	const handleAddToCart = (product: Product) => {
		console.log(`Adding ${product.name} to cart`);
	};

	return (
		<div className="min-h-screen">
			{/* Hero Section */}
			<section className="bg-linear-to-r from-primary to-primary/80 text-primary-foreground py-20">
				<div className="container mx-auto px-4 text-center">
					<h1 className="text-4xl md:text-6xl font-bold mb-6">Welcome to Our Store</h1>
					<p className="text-xl md:text-2xl mb-8 opacity-90">Discover amazing products at great prices</p>
					<Link
						to="/products"
						className="inline-block px-8 py-3 bg-primary-foreground text-primary rounded-lg font-semibold hover:bg-primary-foreground/90 transition-colors"
					>
						Shop Now
					</Link>
				</div>
			</section>

			{/* Featured Products Section */}
			<section className="py-16">
				<div className="container mx-auto px-4">
					<h2 className="text-3xl font-bold text-center mb-12">Featured Products</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
						{featuredProducts.map((product) => (
							<ProductCard
								key={product.id}
								product={product}
								variant="simple"
								showAddToCart={true}
								onAddToCart={handleAddToCart}
							/>
						))}
					</div>

					<div className="text-center mt-12">
						<Link
							to="/products"
							className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
						>
							View All Products
						</Link>
					</div>
				</div>
			</section>
		</div>
	);
}
