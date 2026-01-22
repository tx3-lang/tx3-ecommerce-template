import { IconShoppingCart } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

// Lib
import { formatLovelaceToAda } from '@/lib/ada-formatter';

export interface ProductCardProps {
	product: Database.Product;
	variant?: 'simple' | 'detailed';
	showAddToCart?: boolean;
	onAddToCart?: (product: Database.Product) => void;
	itemsInCart?: number;
}

export function ProductCard({
	product,
	variant = 'simple',
	showAddToCart = false,
	onAddToCart,
	itemsInCart = 0,
}: ProductCardProps) {
	const handleAddToCart = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onAddToCart?.(product);
	};

	const priceInAdaString = formatLovelaceToAda(product.price_lovelace, 2);

	// Get first product image or fallback to emoji
	const productImage =
		product.product_images && product.product_images.length > 0
			? product.product_images.sort((a, b) => a.display_order - b.display_order)[0].image_url
			: '🛍️';

	const isInStock = product.stock > 0;
	const isOutOfStock = product.stock === 0;

	const cardContent = (
		<div className="border rounded-lg p-4 hover:shadow-lg transition-shadow duration-300">
			{/* Product Image */}
			<div className="w-full h-48 bg-gray-100 rounded-lg mb-4 flex items-center justify-center group-hover:bg-gray-50 transition-colors overflow-hidden">
				{productImage.startsWith('http') ? (
					<img
						src={productImage}
						alt={product.product_images?.[0]?.alt_text || product.name}
						className="w-full h-full object-cover"
					/>
				) : (
					<div className="text-center">
						<div className="text-5xl mb-2">{productImage}</div>
					</div>
				)}
			</div>

			{/* Product Info */}
			<h3 className="font-semibold mb-2 text-gray-900 group-hover:text-primary transition-colors">{product.name}</h3>

			{product.description && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.description}</p>}

			{variant === 'detailed' && (
				<>
					{/* Price and Stock */}
					<div className="flex justify-between items-center mb-3">
						<span className="font-bold text-lg text-gray-900">{priceInAdaString}</span>
						<span className={`text-xs font-medium ${isInStock ? 'text-green-600' : 'text-red-600'}`}>
							{isInStock ? `${product.stock} in stock` : 'Out of stock'}
						</span>
					</div>
				</>
			)}

			{variant === 'simple' && (
				<div className="flex justify-between items-center">
					<span className="font-bold">{priceInAdaString}</span>
					<span className="px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors text-sm">
						View
					</span>
				</div>
			)}

			{variant === 'detailed' && showAddToCart && (
				<button
					type="button"
					onClick={handleAddToCart}
					className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
					disabled={isOutOfStock || itemsInCart >= product.stock}
				>
					<IconShoppingCart size={18} className="mr-2" />
					{isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
				</button>
			)}
		</div>
	);

	return (
		<Link to="/product/$productId" params={{ productId: product.id }} className="group">
			{cardContent}
		</Link>
	);
}
