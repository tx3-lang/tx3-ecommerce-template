import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

// Components
import { ProductCard } from '@/components/ProductCard';

// Hooks
import { useCart } from '@/hooks/use-cart';

// Lib
import { getFeaturedProducts } from '@/lib/products';
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
	const { addItem } = useCart();

	const {
		data: featuredProducts = [],
		isLoading,
		error,
	} = useQuery({
		queryKey: ['featured-products'],
		queryFn: getFeaturedProducts,
	});

	const handleAddToCart = (product: Database.Product) => {
		addItem(product.id, 1, product);
	};

	if (isLoading) {
		return (
			<div className="min-h-screen">
				<section className="bg-linear-to-r from-primary to-primary/80 text-primary-foreground py-20">
					<div className="container mx-auto px-4 text-center">
						<h1 className="text-4xl md:text-6xl font-bold mb-6">Welcome to Our Store</h1>
						<p className="text-xl md:text-2xl mb-8 opacity-90">Discover amazing products at great prices</p>
					</div>
				</section>
				<section className="py-16">
					<div className="container mx-auto px-4">
						<div className="text-center">Loading featured products...</div>
					</div>
				</section>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen">
				<section className="bg-linear-to-r from-primary to-primary/80 text-primary-foreground py-20">
					<div className="container mx-auto px-4 text-center">
						<h1 className="text-4xl md:text-6xl font-bold mb-6">Welcome to Our Store</h1>
						<p className="text-xl md:text-2xl mb-8 opacity-90">Discover amazing products at great prices</p>
					</div>
				</section>
				<section className="py-16">
					<div className="container mx-auto px-4">
						<div className="text-center text-red-500">Failed to load featured products</div>
					</div>
				</section>
			</div>
		);
	}

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
						{featuredProducts.map(product => (
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
