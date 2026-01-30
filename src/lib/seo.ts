import { brandConfig } from '@/config/brand';

export interface MetaTag {
	title?: string;
	name?: string;
	property?: string;
	content?: string;
}

export enum MetaTagType {
	BASIC = 'basic',
	SOCIAL = 'social',
	ROBOTS = 'robots',
	ALL = 'all',
}

export interface SEOConfig {
	title?: string;
	description?: string;
	keywords?: string[];
	image?: string;
	type?: string;
	url?: string;
	noIndex?: boolean;
	// Twitter specific
	twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
	twitterSite?: string;
	twitterCreator?: string;
	// Filter options
	include?: MetaTagType[];
}

export function generateMetaTags(config: SEOConfig = {}): MetaTag[] {
	const {
		title = brandConfig.seo.title,
		description = brandConfig.seo.description,
		keywords = brandConfig.seo.keywords,
		image = brandConfig.seo.ogImage,
		type = brandConfig.seo.openGraph?.type || 'website',
		url = brandConfig.seo.openGraph?.url,
		noIndex = false,
		twitterCard = brandConfig.seo.twitterCard?.card || 'summary_large_image',
		twitterSite = brandConfig.seo.twitterCard?.site || '',
		twitterCreator = brandConfig.seo.twitterCard?.creator || '',
		include = [MetaTagType.ALL], // Default: include all tags
	} = config;

	const shouldInclude = (type: MetaTagType) => include.includes(MetaTagType.ALL) || include.includes(type);

	const metaTags: MetaTag[] = [];

	// Basic meta tags
	if (shouldInclude(MetaTagType.BASIC) || shouldInclude(MetaTagType.ALL)) {
		metaTags.push(
			{ title: title },
			{ name: 'description', content: description },
			{ name: 'keywords', content: keywords?.join(', ') || '' },
		);
	}

	// Social meta tags (Open Graph + Twitter + X)
	if (shouldInclude(MetaTagType.SOCIAL) || shouldInclude(MetaTagType.ALL)) {
		// Open Graph meta tags
		metaTags.push(
			{ property: 'og:title', content: title },
			{ property: 'og:description', content: description },
			{ property: 'og:image', content: image || '' },
			{ property: 'og:type', content: type },
			{ property: 'og:site_name', content: brandConfig.seo.openGraph?.siteName || '' },
			{ property: 'og:locale', content: brandConfig.seo.openGraph?.locale || '' },
		);

		if (url) {
			metaTags.push({ property: 'og:url', content: url });
		}

		// Twitter Card meta tags
		metaTags.push(
			{ name: 'twitter:card', content: twitterCard },
			{ name: 'twitter:site', content: twitterSite },
			{ name: 'twitter:creator', content: twitterCreator },
			{ name: 'twitter:title', content: title },
			{ name: 'twitter:description', content: description },
			{ name: 'twitter:image', content: image || '' },
		);

		// URL tag for Twitter (only if URL is provided)
		if (url) {
			metaTags.push({ name: 'twitter:url', content: url });
		}
	}

	// Robots meta tag
	if (shouldInclude(MetaTagType.ROBOTS) || shouldInclude(MetaTagType.ALL)) {
		metaTags.push({ name: 'robots', content: noIndex ? 'noindex,nofollow' : 'index,follow' });
	}

	return metaTags;
}

export function generateProductMetaTags(product: {
	name: string;
	description: string;
	price: number;
	currency: string;
	image?: string;
	category?: string;
	productId: string;
}): MetaTag[] {
	const productUrl = `${brandConfig.seo.openGraph?.url}/product/${product.productId}`;
	const productImage = product.image || brandConfig.seo.ogImage || '';

	const metaTags = generateMetaTags({
		title: product.name,
		description: product.description,
		image: productImage,
		type: 'product',
		url: productUrl,
		keywords: [product.name, product.category || '', ...(brandConfig.seo.keywords || [])].filter(Boolean),
	});

	// Add product-specific Open Graph tags
	metaTags.push(
		{ property: 'product:price:amount', content: product.price.toString() },
		{ property: 'product:price:currency', content: product.currency },
		...(product.category ? [{ property: 'product:category', content: product.category }] : []),
	);

	return metaTags;
}

export function generateCategoryMetaTags(category: { name: string; description?: string }): MetaTag[] {
	const categoryTitle = `${category.name} | ${brandConfig.seo.title}`;
	const categoryUrl = `${brandConfig.seo.openGraph?.url}/category/${category.name.toLowerCase().replace(/\s+/g, '-')}`;

	return generateMetaTags({
		title: categoryTitle,
		description: category.description || `Browse ${category.name} products in our store`,
		type: 'website',
		url: categoryUrl,
		keywords: [category.name, 'category', 'shop', ...(brandConfig.seo.keywords || [])],
	});
}

// Convenience alias for social-only tags
export const generateSocialTags = (config: SEOConfig = {}): MetaTag[] =>
	generateMetaTags({ ...config, include: [MetaTagType.SOCIAL] });
