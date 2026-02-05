import { IconShoppingCart, IconX } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { CartItem } from '@/components/cart/CartItem';
import { CartSummary } from '@/components/cart/CartSummary';
import { EmptyCart } from '@/components/cart/EmptyCart';
import { useCart } from '@/hooks/use-cart';

import { cn } from '@/lib/utils';

interface MiniCartProps {
	isOpen: boolean;
	onClose: () => void;
}

export function MiniCart({ isOpen, onClose }: MiniCartProps) {
	const { items, total, itemCount, updateQuantity, removeItem, currencyBreakdown } = useCart();
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Handle click outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleEscape);
			// Prevent body scroll when dropdown is open
			document.body.style.overflow = 'hidden';
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleEscape);
			document.body.style.overflow = 'unset';
		};
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	return (
		<>
			{/* Backdrop - Mobile only */}
			<button
				type="button"
				className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
				onClick={onClose}
				onKeyDown={e => e.key === 'Enter' && onClose()}
				aria-label="Close cart"
			/>

			{/* Dropdown */}
			<div
				ref={dropdownRef}
				className={cn(
					'fixed bg-gray-900 border border-gray-700 rounded-xl shadow-2xl ring-1 ring-gray-600/50 z-50 text-white backdrop-blur-sm',
					// Mobile: full width
					'w-full max-w-md',
					// Desktop: fixed width
					'lg:w-96',
					// Position
					'right-4',
					// Position right below header
					'top-16',
					// Animation
					'transform transition-all duration-200 ease-out',
					isOpen ? 'translate-y-0 opacity-100 visible' : 'translate-y-2 opacity-0 invisible pointer-events-none',
				)}
			>
				{/* Header */}
				<div className="p-4 border-b border-gray-700 bg-gray-800">
					<div className="flex items-center justify-between mb-3">
						<div className="flex items-center gap-2">
							<IconShoppingCart size={20} className="text-gray-300" />
							<h3 className="font-semibold text-white">Shopping Cart {itemCount > 0 && `(${itemCount})`}</h3>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="p-1 hover:bg-gray-700 rounded-md transition-colors"
							aria-label="Close cart"
						>
							<IconX size={18} className="text-gray-400 hover:text-white" />
						</button>
					</div>

					{/* Currency Badges */}
					{currencyBreakdown && Object.keys(currencyBreakdown).length > 0 && (
						<div className="flex flex-wrap gap-2">
							{Object.entries(currencyBreakdown).map(([currencyKey, data]) => {
								const isAda = data.currencySymbol === '₳';

								return (
									<span
										key={currencyKey}
										className={`px-2 py-1 rounded text-xs font-medium ${
											isAda
												? 'bg-blue-100 text-blue-700 border border-blue-200'
												: 'bg-purple-100 text-purple-700 border border-purple-200'
										}`}
									>
										{data.currencySymbol} ({data.itemCount})
									</span>
								);
							})}
						</div>
					)}
				</div>

				{/* Cart Content */}
				<div className="max-h-96 overflow-y-auto">
					{items.length === 0 ? (
						<EmptyCart compact />
					) : (
						<>
							{/* Display up to 5 items */}
							<div>
								{items.slice(0, 5).map((item, index) => (
									<div key={item.productId} className={index > 0 ? 'border-t border-gray-700' : ''}>
										<CartItem item={item} onQuantityChange={updateQuantity} onRemove={removeItem} compact />
									</div>
								))}
							</div>

							{/* Show "View all" message if there are more than 5 items */}
							{items.length > 5 && (
								<div className="p-4 text-center border-t border-gray-700 bg-gray-800/50 backdrop-blur-sm">
									<p className="text-sm text-gray-300">
										{items.length - 5} more {items.length - 5 === 1 ? 'item' : 'items'} in cart
									</p>
								</div>
							)}

							{/* View full cart button */}
							{items.length > 0 && (
								<div className="p-4 border-t border-gray-700 bg-gray-800/50 backdrop-blur-sm">
									<Link
										to="/cart"
										onClick={onClose}
										className="block w-full text-center py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-lg"
									>
										View Full Cart
									</Link>
								</div>
							)}
						</>
					)}
				</div>

				{/* Footer with Summary */}
				{items.length > 0 && (
					<CartSummary
						currencyBreakdown={currencyBreakdown}
						total={total}
						itemCount={itemCount}
						onCheckout={() => {
							onClose();
						}}
						compact
					/>
				)}
			</div>
		</>
	);
}
