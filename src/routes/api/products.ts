import { createFileRoute } from '@tanstack/react-router';

// Lib
import { supabase } from '@/lib/supabase';

export const Route = createFileRoute('/api/products')({
	loader: async () => {
		const { data, error } = await supabase
			.from('products')
			.select(`
        *,
        product_images (image_url, alt_text, display_order)
      `)
			.eq('is_active', true)
			.is('deleted_at', null)
			.order('created_at', { ascending: false });

		if (error) {
			throw new Error(`Failed to fetch products: ${error.message}`);
		}

		return {
			products: data || [],
			total: data?.length || 0,
			page: 1,
			limit: 12,
		};
	},
});
