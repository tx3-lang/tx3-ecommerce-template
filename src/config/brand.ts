export const brandConfig: BrandConfig = {
	seo: {
		title: 'My Cardano E-commerce',
		description: 'Buy products with ADA and Cardano tokens',
		ogImage: '/og-image.png',
		twitterHandle: '@mycompany',
		keywords: ['e-commerce', 'cardano', 'ada', 'crypto', 'shopping'],
		openGraph: {
			type: 'website',
			siteName: 'My Cardano E-commerce',
			locale: 'en_US',
			url: 'https://my-ecommerce-cardano.com',
		},
		twitterCard: {
			card: 'summary_large_image',
			site: '@mycompany',
			creator: '@mycompany',
		},
	},
	contact: {
		email: 'contact@company.com',
		phone: '+1 555 1234-5678',
		whatsapp: '+155512345678',
		social: {
			twitter: 'https://twitter.com/mycompany',
			instagram: 'https://instagram.com/mycompany',
			facebook: 'https://facebook.com/mycompany',
		},
	},
	business: {
		name: 'My Company',
		taxId: 'XX-XXXXXXXX-X',
		address: '123 Main St, New York, NY 10001',
	},
	features: {
		enableShipping: false,
		disableProductsPage: false,
		disableProductDetailPage: false,
		disableCartFlow: false,
	},
};
