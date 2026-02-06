import {
	IconBrandFacebook,
	IconBrandInstagram,
	IconBrandX,
	IconMail,
	IconMessageCircle,
	IconPhone,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

// Config
import { brandConfig } from '@/config/brand';

export default function Footer() {
	const disableProductsPage = brandConfig.features.disableProductsPage;

	return (
		<footer className="bg-gray-900 text-white border-t border-gray-800">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
					{/* Company Info */}
					<div>
						<div className="flex items-center gap-2 mb-4">
							<div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">📦</div>
							<h3 className="text-lg font-bold">{brandConfig.business.name}</h3>
						</div>
						<p className="text-gray-400 text-sm mb-2">Your trusted store for shopping with cryptocurrencies</p>
						<p className="text-gray-400 text-sm">{brandConfig.business.address}</p>
					</div>

					{/* Quick Links */}
					<div>
						<h4 className="text-lg font-semibold mb-4">Quick Links</h4>
						<nav className="space-y-2">
							<Link to="/" className="block text-gray-400 hover:text-white transition-colors text-sm">
								Home
							</Link>
							{!disableProductsPage && (
								<Link to="/products" className="block text-gray-400 hover:text-white transition-colors text-sm">
									Products
								</Link>
							)}
							<Link to="/cart" className="block text-gray-400 hover:text-white transition-colors text-sm">
								Cart
							</Link>
						</nav>
					</div>

					{/* Contact Info */}
					<div>
						<h4 className="text-lg font-semibold mb-4">Contact</h4>
						<div className="space-y-3">
							<div className="flex items-center gap-3 text-gray-400 text-sm">
								<IconMail size={16} />
								<a href={`mailto:${brandConfig.contact.email}`} className="hover:text-white transition-colors">
									{brandConfig.contact.email}
								</a>
							</div>
							{brandConfig.contact.phone && (
								<div className="flex items-center gap-3 text-gray-400 text-sm">
									<IconPhone size={16} />
									<a href={`tel:${brandConfig.contact.phone}`} className="hover:text-white transition-colors">
										{brandConfig.contact.phone}
									</a>
								</div>
							)}
							{brandConfig.contact.whatsapp && (
								<div className="flex items-center gap-3 text-gray-400 text-sm">
									<IconMessageCircle size={16} />
									<a
										href={`https://wa.me/${brandConfig.contact.whatsapp.replace(/[^\d]/g, '')}`}
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-white transition-colors"
									>
										WhatsApp
									</a>
								</div>
							)}
						</div>
					</div>

					{/* Social Media */}
					<div>
						<h4 className="text-lg font-semibold mb-4">Follow Us</h4>
						<div className="flex space-x-4">
							{brandConfig.contact.social?.twitter && (
								<a
									href={brandConfig.contact.social.twitter}
									target="_blank"
									rel="noopener noreferrer"
									className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 transition-colors"
								>
									<IconBrandX size={18} />
								</a>
							)}
							{brandConfig.contact.social?.instagram && (
								<a
									href={brandConfig.contact.social.instagram}
									target="_blank"
									rel="noopener noreferrer"
									className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 transition-colors"
								>
									<IconBrandInstagram size={18} />
								</a>
							)}
							{brandConfig.contact.social?.facebook && (
								<a
									href={brandConfig.contact.social.facebook}
									target="_blank"
									rel="noopener noreferrer"
									className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 transition-colors"
								>
									<IconBrandFacebook size={18} />
								</a>
							)}
						</div>
					</div>
				</div>

				{/* Bottom Bar */}
				<div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400 text-sm">
					<p>
						&copy; {new Date().getFullYear()} {brandConfig.business.name}. All rights reserved.
					</p>
				</div>
			</div>
		</footer>
	);
}
