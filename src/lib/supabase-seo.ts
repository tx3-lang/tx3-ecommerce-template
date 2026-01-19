import { createServerFn } from '@tanstack/react-start';

// Simple server function to get Supabase config for server-side
export const getSupabaseConfig = createServerFn({ method: 'GET' }).handler(async () => {
	// Server-side access to environment variables
	const supabaseUrl = process.env.VITE_SUPABASE_URL;
	const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error('Missing Supabase environment variables');
	}

	return { supabaseUrl, supabaseAnonKey };
});
