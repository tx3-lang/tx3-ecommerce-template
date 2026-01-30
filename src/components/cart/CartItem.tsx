import { IconAlertTriangle, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/button';
import { QuantitySelector } from '@/components/ui/quantity-selector';
import type { CartItem as TCartItem } from '@/lib/cart-storage';
// Lib
import { formatPriceSyncById } from '@/lib/unified-formatter';
import { cn } from '@/lib/utils';

interface CartItemProps {
	item: TCartItem;
	onQuantityChange: (productId: string, quantity: number) => void;
	onRemove: (productId: string) => void;
	compact?: boolean; // For mini-cart display
}

export function CartItem({ item, onQuantityChange, onRemove, compact = false }: CartItemProps) {
	const [isRemoving, setIsRemoving] = useState(false);

	const handleQuantityChange = (newQuantity: number) => {
		onQuantityChange(item.productId, newQuantity);
	};

	const handleRemove = async () => {
		setIsRemoving(true);
		// Add slight delay for animation
		await new Promise(resolve => setTimeout(resolve, 200));
		onRemove(item.productId);
	};

	const isLowStock = item.product.stock <= 5 && item.product.stock > 0;
	const isOutOfStock = item.product.stock === 0;
	const maxQuantity = item.product.stock;

	// Compact version for mini-cart
	if (compact) {
		return (
			<div
				className={cn(
					'flex items-center gap-3 p-3 border-b last:border-b-0',
					isRemoving && 'opacity-50 scale-95 transition-all duration-200',
				)}
			>
				<div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-gray-800 border border-gray-700">
					{item.product.image_url ? (
						<img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
					) : (
						<div className="w-full h-full flex items-center justify-center bg-gray-700">
							<span className="text-xs text-gray-400">No image</span>
						</div>
					)}
				</div>

				<div className="flex-1 min-w-0">
					<h4 className={cn('font-medium text-sm truncate', compact ? 'text-white' : 'text-gray-900')}>
						{item.product.name}
					</h4>
					<p className={cn('text-xs', compact ? 'text-gray-400' : 'text-gray-500')}>Qty: {item.quantity}</p>
					{isLowStock && (
						<p className="text-xs text-orange-600 flex items-center gap-1">
							<IconAlertTriangle size={10} />
							Only {item.product.stock} left
						</p>
					)}
				</div>

				<div className="text-right">
					<p className={cn('font-semibold text-sm', compact ? 'text-white' : 'text-gray-900')}>
						{formatPriceSyncById(item.subtotal, item.product.token_id, {
							supportedToken: item.product.supported_tokens,
						})}
					</p>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={handleRemove}
						disabled={isRemoving}
						className={cn(
							'h-6 w-6 p-0 text-red-500 hover:text-red-700',
							compact ? 'hover:bg-red-950' : 'hover:bg-red-50',
						)}
					>
						<IconTrash size={12} />
					</Button>
				</div>
			</div>
		);
	}

	// Full version for cart page
	return (
		<div
			className={cn(
				'flex gap-4 p-4 border rounded-lg bg-white',
				isRemoving && 'opacity-50 scale-95 transition-all duration-200',
			)}
		>
			{/* Product Image */}
			<div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-gray-800 border border-gray-700">
				{item.product.image_url ? (
					<img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
				) : (
					<div className="w-full h-full flex items-center justify-center bg-gray-700">
						<span className="text-sm text-gray-400">No image</span>
					</div>
				)}
			</div>

			{/* Product Details */}
			<div className="flex-1">
				<div className="flex justify-between items-start mb-2">
					<div>
						<h3 className={cn('font-semibold text-lg', compact ? 'text-white' : 'text-gray-900')}>
							{item.product.name}
						</h3>
						{item.product.description && (
							<p className={cn('text-sm mt-1 line-clamp-2', compact ? 'text-gray-300' : 'text-gray-600')}>
								{item.product.description}
							</p>
						)}
					</div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={handleRemove}
						disabled={isRemoving}
						className={cn('text-red-500 hover:text-red-700', compact ? 'hover:bg-red-950' : 'hover:bg-red-50')}
					>
						<IconTrash size={16} />
					</Button>
				</div>

				{/* Stock Status */}
				{isOutOfStock ? (
					<div className="flex items-center gap-2 text-red-600 text-sm mb-3">
						<IconAlertTriangle size={14} />
						<span>Out of stock</span>
					</div>
				) : isLowStock ? (
					<div className="flex items-center gap-2 text-orange-600 text-sm mb-3">
						<IconAlertTriangle size={14} />
						<span>Only {item.product.stock} left in stock</span>
					</div>
				) : (
					<div className="flex items-center gap-2 text-green-600 text-sm mb-3">
						<span>✓ In stock</span>
					</div>
				)}

				{/* Price and Quantity Controls */}
				<div className="flex items-center justify-between">
					<div>
						<p className={cn('text-sm', compact ? 'text-gray-400' : 'text-gray-600')}>
							{formatPriceSyncById(item.product.price, item.product.token_id, {
								supportedToken: item.product.supported_tokens,
							})}{' '}
							each
						</p>
						<p className={cn('font-semibold text-lg', compact ? 'text-white' : 'text-gray-900')}>
							{formatPriceSyncById(item.subtotal, item.product.token_id, {
								supportedToken: item.product.supported_tokens,
							})}
						</p>
					</div>

					<QuantitySelector
						value={item.quantity}
						min={1}
						max={maxQuantity}
						onChange={handleQuantityChange}
						disabled={isOutOfStock || isRemoving}
						size="md"
					/>
				</div>
			</div>
		</div>
	);
}
