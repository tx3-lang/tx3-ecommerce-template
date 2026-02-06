declare interface BrandConfig {
	seo: {
		title: string;
		description: string;
		ogImage?: string;
		twitterHandle?: string;
		keywords?: string[];
		openGraph?: {
			type?: string;
			siteName?: string;
			locale?: string;
			url?: string;
		};
		twitterCard?: {
			card?: 'summary' | 'summary_large_image' | 'app' | 'player';
			site?: string;
			creator?: string;
		};
	};
	contact: {
		email: string;
		phone?: string;
		whatsapp?: string;
		social?: Record<string, string>;
	};
	business: {
		name: string;
		taxId?: string;
		address?: string;
	};
	features: {
		enableShipping: boolean;
		disableProductsPage: boolean;
		disableProductDetailPage: boolean;
		disableCartFlow: boolean;
	};
}

declare interface BrandTheme {
	primary: string;
	secondary: string;
	accent: string;
	font: string;
}
