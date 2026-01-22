import { IconShield, IconShoppingCart, IconTruck } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useId, useState } from 'react';

// Components
import { QuantitySelector } from '@/components/ui/quantity-selector';

// Hooks
import { useCart } from '@/hooks/use-cart';
import { useProduct } from '@/hooks/use-products';

// Lib
import { ADA_SYMBOL, formatLovelaceToAda } from '@/lib/ada-formatter';
import type { CartItem } from '@/lib/cart-storage';
import { generateProductMetaTags } from '@/lib/seo';
import { getSupabaseConfig } from '@/lib/supabase-seo';

export const Route = createFileRoute('/(shop)/product/$productId')({
	component: ProductDetail,
	loader: async ({ params: { productId } }) => {
		try {
			// Get Supabase config server-side
			const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();

			// Fetch minimal SEO data server-side
			const supabase = await import('@supabase/supabase-js').then(m => m.createClient(supabaseUrl, supabaseAnonKey));

			const { data, error } = await supabase
				.from('products')
				.select(`
					name,
					description,
					price_lovelace,
					product_images (image_url, alt_text, display_order)
				`)
				.eq('id', productId)
				.eq('is_active', true)
				.single();

			if (error) {
				// Return null for 404 cases, let component handle it
				if (error.code === 'PGRST116') {
					return { seoData: null };
				}
				throw error;
			}

			return { seoData: data };
		} catch (error) {
			// Fallback if server-side fetch fails
			console.error('Failed to fetch SEO data:', error);
			return { seoData: null };
		}
	},
	head: ({ loaderData, params }) => {
		const { seoData } = loaderData || {};

		if (seoData) {
			const priceInAda = seoData.price_lovelace / 1_000_000;
			// Get the first image if available, otherwise use placeholder
			const productImage = seoData.product_images?.[0]?.image_url || '/images/product-placeholder.jpg';

			const metaTags = generateProductMetaTags({
				name: seoData.name,
				description: seoData.description || 'Premium product available on our e-commerce platform',
				price: priceInAda,
				image: productImage,
				category: 'General',
				productId: params.productId,
			});

			return {
				meta: metaTags,
			};
		}

		return {};
	},
});

function ProductDetail() {
	const quantityId = useId();
	const { productId } = Route.useParams();
	const { data: product, isLoading, error } = useProduct(productId);
	const { addItem, getItemQuantity, updateProductStock } = useCart();
	const [quantity, setQuantity] = useState(1);

	const currentProductQuantity = getItemQuantity(productId);
	const maxQuantity = product ? product.stock - currentProductQuantity : 1;

	// Update cart item stock when product data loads
	useEffect(() => {
		if (product && currentProductQuantity > 0) {
			// Check if this product is in the cart and update its stock
			const cart = JSON.parse(localStorage.getItem('ecommerce-cart') || '{}');
			if (cart.items) {
				const cartItem = cart.items.find((item: CartItem) => item.productId === productId);
				if (cartItem && cartItem.product.stock !== product.stock) {
					// Update the stock in the cart item
					updateProductStock(productId, product.stock);
				}
			}
		}
	}, [product, productId, currentProductQuantity, updateProductStock]);

	// Loading state
	if (isLoading) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="animate-pulse">
					<div className="mb-8">
						<div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
						<div className="h-4 bg-gray-200 rounded w-96"></div>
					</div>
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
						<div className="w-full aspect-square bg-gray-200 rounded-lg"></div>
						<div className="space-y-4">
							<div className="h-8 bg-gray-200 rounded w-3/4"></div>
							<div className="h-4 bg-gray-200 rounded w-full"></div>
							<div className="h-4 bg-gray-200 rounded w-2/3"></div>
							<div className="h-8 bg-gray-200 rounded w-1/2 mt-8"></div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Error state
	if (error || !product) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="text-center">
					<h1 className="text-3xl font-bold text-gray-900 mb-4">Product Not Found</h1>
					<p className="text-gray-600 mb-8">The product you're looking for doesn't exist or has been removed.</p>
					<a
						href="/products"
						className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
					>
						Back to Products
					</a>
				</div>
			</div>
		);
	}

	const handleAddToCart = () => {
		addItem(product.id, quantity, product);
	};

	const priceInAdaString = formatLovelaceToAda(product.price_lovelace, 2);

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
					<li className="text-gray-900">{product.name}</li>
				</ol>
			</nav>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
				{/* Product Images */}
				<div className="space-y-4">
					<div className="w-full aspect-square bg-gray-100 rounded-lg overflow-hidden">
						<div className="w-full h-full bg-linear-to-br from-gray-200 to-gray-300 flex items-center justify-center">
							<div className="text-center">
								<div className="text-6xl mb-2">📦</div>
								<p className="text-gray-600">Product Image</p>
								{product.product_images && product.product_images.length > 0 && (
									<p className="text-xs text-gray-500 mt-2">{product.product_images[0].alt_text}</p>
								)}
							</div>
						</div>
					</div>
					{product.product_images && product.product_images.length > 1 && (
						<div className="grid grid-cols-4 gap-2">
							{product.product_images.slice(0, 4).map((image: Database.ProductImage) => (
								<div
									key={image.id}
									className="aspect-square bg-gray-100 rounded-md hover:ring-2 hover:ring-primary"
								></div>
							))}
						</div>
					)}
				</div>

				{/* Product Info */}
				<div className="space-y-6">
					<div>
						<h1 className="text-3xl font-bold text-gray-900 mb-4">{product.name}</h1>

						<p className="text-lg text-gray-700 leading-relaxed mb-6">{product.description}</p>
					</div>

					{/* Price and Actions */}
					<div className="border-t border-b border-gray-200 py-6">
						<div className="flex items-baseline mb-6">
							<span className="text-3xl font-bold text-gray-900">{priceInAdaString}</span>
							{product.stock > 0 ? (
								<span className="ml-4 text-sm text-green-600 font-medium">{product.stock} in stock</span>
							) : (
								<span className="ml-4 text-sm text-red-600 font-medium">Out of stock</span>
							)}
						</div>

						<div className="space-y-4">
							<div className="flex items-center space-x-4">
								<label htmlFor="quantity" className="text-sm font-medium text-gray-700">
									Quantity:
								</label>
								<QuantitySelector
									id={quantityId}
									value={quantity}
									onChange={setQuantity}
									min={1}
									max={maxQuantity}
									size="md"
								/>
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
									onClick={handleAddToCart}
									disabled={maxQuantity === 0}
									className="flex-1 px-6 py-3 border border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors font-medium flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<IconShoppingCart size={20} className="mr-2" />
									Add to Cart
								</button>
							</div>
						</div>
					</div>

					{/* Benefits */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-gray-200">
						<div className="text-center p-4">
							<IconTruck size={32} className="mx-auto mb-2 text-primary" />
							<p className="text-sm font-medium text-gray-900">Free Shipping</p>
							<p className="text-xs text-gray-600">Orders over 100 {ADA_SYMBOL}</p>
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
							Reviews
						</button>
					</nav>
				</div>

				<div className="space-y-6">
					<div>
						<h3 className="text-xl font-semibold text-gray-900 mb-4">Product Description</h3>
						<div className="prose max-w-none text-gray-700">
							<p className="mb-4">{product.description}</p>
							<p className="mb-4">
								This premium product is designed with quality and functionality in mind. With careful attention to
								detail and high-quality materials, it provides an excellent user experience.
							</p>
							<h4 className="text-lg font-semibold text-gray-900 mb-2">What's in the box:</h4>
							<ul className="list-disc pl-6 space-y-1">
								<li>Premium Product</li>
								<li>User Manual</li>
								<li>Warranty Card</li>
								<li>Packaging</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
