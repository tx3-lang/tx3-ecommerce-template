import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/orders')({
	loader: async () => {
		// TODO: Implement order fetching from Supabase
		return [];
	},
});
