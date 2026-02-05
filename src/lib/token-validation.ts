import { supabase } from './supabase';

// Token validation functions
export async function isTokenSupported(tokenId: string): Promise<boolean> {
	if (!tokenId) return false;

	try {
		const { data, error } = await supabase
			.from('supported_tokens')
			.select('id, is_active')
			.eq('id', tokenId)
			.eq('is_active', true)
			.single();

		return !error && !!data;
	} catch (error) {
		console.error('Error checking token support:', error);
		return false;
	}
}

export async function getTokenMetadataById(tokenId: string): Promise<Database.SupportedToken | null> {
	if (!tokenId) return null;

	try {
		const { data, error } = await supabase.from('supported_tokens').select('*').eq('id', tokenId).single();

		if (error) return null;
		return data;
	} catch (error) {
		console.error('Error getting token metadata:', error);
		return null;
	}
}
