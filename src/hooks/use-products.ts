import { useCallback, useEffect, useState } from 'react';

// Lib
import { supabase } from '@/lib/supabase';

export function useProducts() {
	const [products, setProducts] = useState<Product[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchProducts = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const { data, error } = await supabase
				.from('products')
				.select('*')
				.eq('is_active', true)
				.is('deleted_at', null)
				.order('created_at', { ascending: false });

			if (error) throw error;

			setProducts(data || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch products');
			console.error('Error fetching products:', err);
		} finally {
			setLoading(false);
		}
	}, []);

	const getProduct = async (id: string): Promise<Product | null> => {
		try {
			const { data, error } = await supabase
				.from('products')
				.select('*')
				.eq('id', id)
				.eq('is_active', true)
				.is('deleted_at', null)
				.single();

			if (error) throw error;

			return data;
		} catch (err) {
			console.error('Error fetching product:', err);
			return null;
		}
	};

	useEffect(() => {
		fetchProducts();
	}, [fetchProducts]);

	return {
		products,
		loading,
		error,
		fetchProducts,
		getProduct,
	};
}
