import { supabase } from './supabase';

export async function getFeaturedProducts() {
	const { data, error } = await supabase
		.from('products')
		.select(`
			*,
			product_images (image_url, alt_text, display_order),
			supported_tokens (policy_id, asset_name, display_name, decimals)
    `)
		.eq('is_featured', true)
		.eq('is_active', true)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(8);

	if (error) {
		throw new Error(`Failed to fetch featured products: ${error.message}`);
	}

	return data || [];
}
