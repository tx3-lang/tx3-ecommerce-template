import { useQuery } from '@tanstack/react-query';

// Lib
import { supabase } from '@/lib/supabase';

// All products
export function useProducts() {
	return useQuery({
		queryKey: ['products'],
		queryFn: async () => {
			const { data, error } = await supabase
				.from('products')
				.select(`
          *,
          product_images (image_url, alt_text, display_order),
					supported_tokens (policy_id, asset_name, display_name, decimals)
        `)
				.eq('is_active', true)
				.is('deleted_at', null)
				.order('created_at', { ascending: false });

			if (error) throw error;
			return data || [];
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
		gcTime: 10 * 60 * 1000, // 10 minutes
	});
}

// Single product
export function useProduct(productId: string) {
	return useQuery<Database.Product>({
		queryKey: ['product', productId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from('products')
				.select(`
          *,
          product_images (image_url, alt_text, display_order),
					supported_tokens (policy_id, asset_name, display_name, decimals)
        `)
				.eq('id', productId)
				.eq('is_active', true)
				.is('deleted_at', null)
				.single();

			if (error) throw error;
			return data;
		},
		enabled: !!productId,
		staleTime: 5 * 60 * 1000,
	});
}
