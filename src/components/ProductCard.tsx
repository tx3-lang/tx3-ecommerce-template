import { IconShoppingCart, IconStar, IconStarHalf } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

export interface Product {
	id: string;
	name: string;
	description: string;
	price: number;
	image: string;
	category: string;
	rating?: number;
	reviews?: number;
	stock?: number;
}

export interface ProductCardProps {
	product: Product;
	variant?: 'simple' | 'detailed';
	showAddToCart?: boolean;
	onAddToCart?: (product: Product) => void;
}

export function ProductCard({ product, variant = 'simple', showAddToCart = false, onAddToCart }: ProductCardProps) {
	const renderStars = (rating?: number) => {
		if (!rating) return null;

		const fullStars = Math.floor(rating);
		const hasHalfStar = rating % 1 !== 0;

		return (
			<div className="flex items-center">
				{Array.from({ length: fullStars }).map((_, i) => (
					<IconStar key={`star-${rating}-${i}-${Date.now()}`} size={16} className="text-yellow-400 fill-current" />
				))}
				{hasHalfStar && <IconStarHalf size={16} className="text-yellow-400 fill-current" />}
				<span className="text-xs text-gray-500 ml-1">({rating})</span>
			</div>
		);
	};

	const handleAddToCart = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onAddToCart?.(product);
	};

	const cardContent = (
		<div className="border rounded-lg p-4 hover:shadow-lg transition-shadow duration-300 cursor-pointer">
			{/* Product Image */}
			<div className="w-full h-48 bg-gray-100 rounded-lg mb-4 flex items-center justify-center group-hover:bg-gray-50 transition-colors">
				<div className="text-center">
					<div className="text-5xl mb-2">{product.image}</div>
				</div>
			</div>

			{/* Product Info */}
			<span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mb-2">
				{product.category}
			</span>

			<h3 className="font-semibold mb-2 text-gray-900 group-hover:text-primary transition-colors">{product.name}</h3>

			<p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.description}</p>

			{variant === 'detailed' && (
				<>
					{/* Rating */}
					{product.rating && <div className="mb-3">{renderStars(product.rating)}</div>}

					{/* Price and Stock */}
					<div className="flex justify-between items-center mb-3">
						<span className="font-bold text-lg text-gray-900">{product.price.toFixed(2)} ADA</span>
						{product.stock !== undefined &&
							(product.stock > 0 ? (
								<span className="text-xs text-green-600 font-medium">{product.stock} in stock</span>
							) : (
								<span className="text-xs text-red-600 font-medium">Out of stock</span>
							))}
					</div>
				</>
			)}

			{variant === 'simple' && (
				<div className="flex justify-between items-center">
					<span className="font-bold">{product.price.toFixed(2)} ADA</span>
					{showAddToCart && (
						<button
							type="button"
							onClick={handleAddToCart}
							className="px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors text-sm"
						>
							View
						</button>
					)}
				</div>
			)}

			{variant === 'detailed' && showAddToCart && (
				<button
					type="button"
					onClick={handleAddToCart}
					className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium flex items-center justify-center"
					disabled={product.stock === 0}
				>
					<IconShoppingCart size={18} className="mr-2" />
					Add to Cart
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
