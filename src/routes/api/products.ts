import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/products')({
	loader: async () => {
		// TODO: Implement real product fetching from Supabase
		return {
			products: [],
			total: 0,
			page: 1,
			limit: 12,
		};
	},
});
