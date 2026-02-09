import { IconMenu2, IconPackage, IconShoppingCart, IconX } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

// Components
import { MiniCart } from '@/components/cart/MiniCart';

// Config
import { brandConfig } from '@/config/brand';

// Hooks
import { useCart } from '@/hooks/use-cart';

// Lib
import { cn } from '@/lib/utils';

export default function Header() {
	const [isOpen, setIsOpen] = useState(false);
	const [isMiniCartOpen, setIsMiniCartOpen] = useState(false);
	const { itemCount } = useCart();
	const { disableProductsPage, disableCartFlow } = brandConfig.features;

	return (
		<>
			{/* Mobile Menu Backdrop */}
			{isOpen && (
				<button
					type="button"
					className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden cursor-default"
					onClick={() => setIsOpen(false)}
					onKeyDown={e => e.key === 'Escape' && setIsOpen(false)}
					aria-label="Close mobile menu"
				/>
			)}

			<header className="sticky top-0 z-50 bg-linear-to-r from-blue-600 to-blue-700 text-white shadow-xl border-b border-blue-500/30">
				<div className="container mx-auto px-4">
					<div className="flex items-center justify-between h-16">
						{/* Left: Logo + Nav */}
						<div className="flex items-center gap-6 lg:gap-8">
							{/* Mobile Menu Button */}
							<button
								type="button"
								onClick={() => setIsOpen(true)}
								className="lg:hidden p-2 hover:bg-blue-800/50 rounded-lg transition-all duration-200"
								aria-label="Open menu"
							>
								<IconMenu2 size={20} />
							</button>

							{/* Logo/Brand */}
							<Link
								to="/"
								className="group flex items-center gap-2 lg:gap-3 text-lg lg:text-xl font-bold text-white hover:text-gray-200 transition-all duration-200"
							>
								{/* Logo Placeholder */}
								<div className="w-7 h-7 lg:w-8 lg:h-8 rounded-lg flex items-center justify-center transition-all duration-200">
									<IconPackage size={14} className="text-white" />
								</div>
								<span className="hidden sm:inline">{brandConfig.business.name}</span>
							</Link>

							{/* Desktop Navigation */}
							<nav className="hidden lg:flex items-center">
								{!disableProductsPage && (
									<Link
										to="/products"
										className="font-medium text-blue-100 hover:text-white transition-all duration-200 relative group"
									>
										Products
										<span className="absolute bottom-0 left-0 w-0 h-0.5 bg-brand-primary transition-all duration-200 group-hover:w-full"></span>
									</Link>
								)}
							</nav>
						</div>

						{/* Right: Cart */}
						<div className="flex items-center">
							<button
								type="button"
								onClick={() => {
									if (disableCartFlow) {
										return;
									}
									setIsMiniCartOpen(!isMiniCartOpen);
								}}
								className="group relative p-2 hover:bg-blue-800/30 rounded-lg transition-all duration-200"
								aria-label={`Shopping cart with ${itemCount} items`}
							>
								<IconShoppingCart
									size={20}
									className="text-blue-100 group-hover:text-white transition-colors duration-200"
								/>
								{/* Animated Badge */}
								{itemCount > 0 && (
									<span className="absolute -top-1 -right-1 bg-linear-to-r from-red-500 to-red-600 text-white text-xs font-bold rounded-full min-w-5 h-5 flex items-center justify-center px-1.5 shadow-md group-hover:shadow-lg transition-all duration-200">
										{itemCount > 99 ? '99+' : itemCount}
									</span>
								)}
							</button>

							{/* MiniCart Dropdown */}
							{!disableCartFlow && <MiniCart isOpen={isMiniCartOpen} onClose={() => setIsMiniCartOpen(false)} />}
						</div>
					</div>
				</div>
			</header>

			{/* Mobile Menu Slide-in */}
			<aside
				className={cn(
					'fixed top-0 left-0 h-full w-80 bg-linear-to-b from-blue-600 to-blue-700 text-white shadow-2xl z-50 transform transition-all duration-500 ease-out flex flex-col',
					isOpen ? 'translate-x-0' : '-translate-x-full',
				)}
			>
				<div className="flex items-center justify-between p-6 border-b border-blue-500/30">
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 rounded-lg flex items-center justify-center">
							<IconPackage size={16} className="text-white" />
						</div>
						<h2 className="text-xl font-bold">{brandConfig.business.name}</h2>
					</div>
					<button
						type="button"
						onClick={() => setIsOpen(false)}
						className="p-3 hover:bg-blue-800/50 rounded-xl transition-all duration-300 hover:scale-105 active:scale-95"
						aria-label="Close menu"
					>
						<IconX size={20} />
					</button>
				</div>

				<nav className="flex-1 p-6 overflow-y-auto">
					<Link
						to="/"
						onClick={() => setIsOpen(false)}
						className="group flex items-center gap-4 p-4 rounded-xl hover:bg-blue-800/50 transition-all duration-300 mb-3 hover:scale-105 active:scale-95"
						activeProps={{
							className:
								'flex items-center gap-4 p-4 rounded-xl bg-linear-to-r from-brand-primary to-brand-secondary shadow-lg text-white',
						}}
					>
						<span className="font-medium">Home</span>
						<span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">→</span>
					</Link>

					{!disableProductsPage && (
						<Link
							to="/products"
							onClick={() => setIsOpen(false)}
							className="group flex items-center gap-4 p-4 rounded-xl hover:bg-blue-800/50 transition-all duration-300 mb-3 hover:scale-105 active:scale-95"
							activeProps={{
								className:
									'flex items-center gap-4 p-4 rounded-xl bg-linear-to-r from-brand-primary to-brand-secondary shadow-lg text-white',
							}}
						>
							<span className="font-medium">Products</span>
							<span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">→</span>
						</Link>
					)}

					<Link
						to="/checkout"
						onClick={() => setIsOpen(false)}
						className="group flex items-center gap-4 p-4 rounded-xl hover:bg-blue-800/50 transition-all duration-300 mb-3 hover:scale-105 active:scale-95"
						activeProps={{
							className:
								'flex items-center gap-4 p-4 rounded-xl bg-linear-to-r from-brand-primary to-brand-secondary shadow-lg text-white',
						}}
					>
						<span className="font-medium">Checkout</span>
						<span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">→</span>
					</Link>

					{/* Contact Info */}
					<div className="mt-8 p-4 bg-blue-800/30 rounded-xl border border-blue-600/30">
						<h3 className="font-semibold mb-3 text-blue-100">Contact</h3>
						<div className="space-y-2 text-sm text-blue-100">
							<p>📧 {brandConfig.contact.email}</p>
							{brandConfig.contact.phone && <p>📞 {brandConfig.contact.phone}</p>}
							{brandConfig.contact.whatsapp && <p>💬 {brandConfig.contact.whatsapp}</p>}
						</div>
					</div>
				</nav>
			</aside>
		</>
	);
}
