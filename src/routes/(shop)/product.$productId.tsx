import { IconShield, IconShoppingCart, IconStar, IconStarHalf, IconTruck } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useId } from 'react';

// Helpers
import { generateProductMetaTags } from '@/lib/seo';

export const Route = createFileRoute('/(shop)/product/$productId')({
	component: ProductDetail,
	head: ({ params }) => {
		// Mock product data - in real app this would come from API
		const mockProduct = {
			name: 'Premium Wireless Headphones',
			price: 85.5,
			description:
				'Experience crystal-clear audio with our premium wireless headphones. Featuring active noise cancellation, 30-hour battery life, and premium comfort for all-day wear.',
			image: '/products/headphones.jpg',
			category: 'Electronics',
		};

		const metaTags = generateProductMetaTags({
			name: mockProduct.name,
			description: mockProduct.description,
			price: mockProduct.price,
			image: mockProduct.image,
			category: mockProduct.category,
			productId: params.productId,
		});

		return {
			meta: metaTags,
		};
	},
});

function ProductDetail() {
	const quantityId = useId();
	const { productId } = Route.useParams();

	// Mock data - this would come from API based on productId
	const mockProduct = {
		id: productId,
		name: 'Premium Wireless Headphones',
		price: 85.5,
		description:
			'Experience crystal-clear audio with our premium wireless headphones. Featuring active noise cancellation, 30-hour battery life, and premium comfort for all-day wear.',
		stock: 15,
		category: 'Electronics',
		rating: 4.5,
		reviews: 128,
		features: [
			'Active Noise Cancellation',
			'30-hour battery life',
			'Bluetooth 5.0 connectivity',
			'Premium memory foam cushions',
			'Foldable design',
			'Built-in microphone',
		],
	};

	return (
		<div className="container mx-auto px-4 py-8">
			{/* Breadcrumb */}
			<nav className="mb-8">
				<ol className="flex items-center space-x-2 text-sm text-gray-600">
					<li>
						<a href="/" className="hover:text-primary">
							Home
						</a>
					</li>
					<li>/</li>
					<li>
						<a href="/products" className="hover:text-primary">
							Products
						</a>
					</li>
					<li>/</li>
					<li className="text-gray-900">{mockProduct.name}</li>
				</ol>
			</nav>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
				{/* Product Images */}
				<div className="space-y-4">
					<div className="w-full aspect-square bg-gray-100 rounded-lg overflow-hidden">
						<div className="w-full h-full bg-linear-to-br from-gray-200 to-gray-300 flex items-center justify-center">
							<div className="text-center">
								<div className="text-4xl mb-2">🎧</div>
								<p className="text-gray-600">Product Image</p>
							</div>
						</div>
					</div>
					<div className="grid grid-cols-4 gap-2">
						<div className="aspect-square bg-gray-100 rounded-md cursor-pointer hover:ring-2 hover:ring-primary"></div>
						<div className="aspect-square bg-gray-100 rounded-md cursor-pointer hover:ring-2 hover:ring-primary"></div>
						<div className="aspect-square bg-gray-100 rounded-md cursor-pointer hover:ring-2 hover:ring-primary"></div>
						<div className="aspect-square bg-gray-100 rounded-md cursor-pointer hover:ring-2 hover:ring-primary"></div>
					</div>
				</div>

				{/* Product Info */}
				<div className="space-y-6">
					<div>
						<span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full mb-2">
							{mockProduct.category}
						</span>
						<h1 className="text-3xl font-bold text-gray-900 mb-4">{mockProduct.name}</h1>

						{/* Rating */}
						<div className="flex items-center space-x-2 mb-4">
							<div className="flex">
								<IconStar size={20} className="text-yellow-400 fill-current" />
								<IconStar size={20} className="text-yellow-400 fill-current" />
								<IconStar size={20} className="text-yellow-400 fill-current" />
								<IconStar size={20} className="text-yellow-400 fill-current" />
								<IconStarHalf size={20} className="text-yellow-400 fill-current" />
							</div>
							<span className="text-gray-600">
								{mockProduct.rating} ({mockProduct.reviews} reviews)
							</span>
						</div>

						<p className="text-lg text-gray-700 leading-relaxed mb-6">{mockProduct.description}</p>
					</div>

					{/* Price and Actions */}
					<div className="border-t border-b border-gray-200 py-6">
						<div className="flex items-baseline mb-6">
							<span className="text-3xl font-bold text-gray-900">{mockProduct.price} ADA</span>
							{mockProduct.stock > 0 ? (
								<span className="ml-4 text-sm text-green-600 font-medium">{mockProduct.stock} in stock</span>
							) : (
								<span className="ml-4 text-sm text-red-600 font-medium">Out of stock</span>
							)}
						</div>

						<div className="space-y-4">
							<div className="flex items-center space-x-4">
								<label htmlFor="quantity" className="text-sm font-medium text-gray-700">
									Quantity:
								</label>
								<div className="flex items-center border border-gray-300 rounded-lg">
									<button type="button" className="p-2 hover:bg-gray-100">
										-
									</button>
									<input
										id={quantityId}
										type="number"
										value="1"
										className="w-16 text-center border-x border-gray-300 py-2"
									/>
									<button type="button" className="p-2 hover:bg-gray-100">
										+
									</button>
								</div>
							</div>

							<div className="flex space-x-4">
								<button
									type="button"
									className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
								>
									Buy Now
								</button>
								<button
									type="button"
									className="flex-1 px-6 py-3 border border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors font-medium flex items-center justify-center"
								>
									<IconShoppingCart size={20} className="mr-2" />
									Add to Cart
								</button>
							</div>
						</div>
					</div>

					{/* Features */}
					<div className="space-y-4">
						<h3 className="text-lg font-semibold text-gray-900 mb-3">Key Features</h3>
						<ul className="space-y-2">
							{mockProduct.features.map((feature) => (
								<li key={feature} className="flex items-center text-gray-700">
									<div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
									{feature}
								</li>
							))}
						</ul>
					</div>

					{/* Benefits */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-gray-200">
						<div className="text-center p-4">
							<IconTruck size={32} className="mx-auto mb-2 text-primary" />
							<p className="text-sm font-medium text-gray-900">Free Shipping</p>
							<p className="text-xs text-gray-600">Orders over 100 ADA</p>
						</div>
						<div className="text-center p-4">
							<IconShield size={32} className="mx-auto mb-2 text-primary" />
							<p className="text-sm font-medium text-gray-900">1 Year Warranty</p>
							<p className="text-xs text-gray-600">Full coverage</p>
						</div>
						<div className="text-center p-4">
							<IconShoppingCart size={32} className="mx-auto mb-2 text-primary" />
							<p className="text-sm font-medium text-gray-900">Secure Payment</p>
							<p className="text-xs text-gray-600">ADA & Tokens</p>
						</div>
					</div>
				</div>
			</div>

			{/* Product Details Tabs */}
			<div className="border-t border-gray-200 pt-8">
				<div className="border-b border-gray-200 mb-8">
					<nav className="-mb-px flex space-x-8">
						<button type="button" className="border-b-2 border-primary text-primary py-2 px-1 font-medium text-sm">
							Description
						</button>
						<button
							type="button"
							className="border-b-2 border-transparent text-gray-500 hover:text-gray-700 py-2 px-1 font-medium text-sm"
						>
							Specifications
						</button>
						<button
							type="button"
							className="border-b-2 border-transparent text-gray-500 hover:text-gray-700 py-2 px-1 font-medium text-sm"
						>
							Reviews ({mockProduct.reviews})
						</button>
					</nav>
				</div>

				<div className="space-y-6">
					<div>
						<h3 className="text-xl font-semibold text-gray-900 mb-4">Product Description</h3>
						<div className="prose max-w-none text-gray-700">
							<p className="mb-4">{mockProduct.description}</p>
							<p className="mb-4">
								Our premium wireless headphones are designed for audiophiles who demand the best in sound quality and
								comfort. With advanced noise cancellation technology, you can immerse yourself in your music without
								distractions.
							</p>
							<h4 className="text-lg font-semibold text-gray-900 mb-2">What's in the box:</h4>
							<ul className="list-disc pl-6 space-y-1">
								<li>Premium Wireless Headphones</li>
								<li>USB-C Charging Cable</li>
								<li>3.5mm Audio Cable</li>
								<li>Carrying Case</li>
								<li>Quick Start Guide</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
