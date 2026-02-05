import { supabase } from '@/lib/supabase';
import { hexToAscii } from './unified-formatter';

export interface TokenMetadata {
	policy_id: string;
	asset_name: string;
	display_name: string | null;
	decimals: number;
	is_active: boolean;
}

// Cache for token metadata to avoid repeated database queries
const tokenCache = new Map<string, TokenMetadata | null>();
const tokenByIdCache = new Map<string, TokenMetadata | null>();

/**
 * Get token metadata from the supported_tokens table
 * @param policyId The token policy ID
 * @param assetName The token asset name in hex
 * @returns TokenMetadata if found and active, null if not found
 */
export async function getTokenMetadata(policyId: string, assetName: string): Promise<TokenMetadata | null> {
	const cacheKey = `${policyId}:${assetName}`;

	// Check cache first
	if (tokenCache.has(cacheKey)) {
		return tokenCache.get(cacheKey) || null;
	}

	try {
		const client = supabase;

		const { data, error } = await client
			.from('supported_tokens')
			.select('*')
			.eq('policy_id', policyId)
			.eq('asset_name', assetName)
			.eq('is_active', true)
			.single();

		if (error || !data) {
			tokenCache.set(cacheKey, null);
			return null;
		}

		// Cache the result
		tokenCache.set(cacheKey, data);
		return data;
	} catch (error) {
		console.error('Error fetching token metadata:', error);
		tokenCache.set(cacheKey, null);
		return null;
	}
}

/**
 * Get the display name for a token
 * If display_name is null in the database, returns the hex-decoded asset name
 * @param policyId The token policy ID
 * @param assetName The token asset name in hex
 * @returns Display name for the token
 */
export async function getTokenDisplayName(policyId: string, assetName: string): Promise<string> {
	const metadata = await getTokenMetadata(policyId, assetName);

	if (metadata?.display_name) {
		return metadata.display_name;
	}

	// Fallback to hex-decoded name
	return hexToAscii(assetName) || assetName;
}

/**
 * Get the decimal places for a token
 * If token is not found in supported_tokens, returns 0 (safe default)
 * @param policyId The token policy ID
 * @param assetName The token asset name in hex
 * @returns Number of decimal places
 */
export async function getTokenDecimals(policyId: string, assetName: string): Promise<number> {
	const metadata = await getTokenMetadata(policyId, assetName);
	return metadata?.decimals ?? 0;
}

/**
 * Check if a token is supported (exists in supported_tokens and is active)
 * @param policyId The token policy ID
 * @param assetName The token asset name in hex
 * @returns true if token is supported, false otherwise
 */
export async function isTokenSupported(policyId: string, assetName: string): Promise<boolean> {
	const metadata = await getTokenMetadata(policyId, assetName);
	return metadata !== null;
}

/**
 * Clear the token metadata cache (useful for testing or after database updates)
 */
export function clearTokenCache(): void {
	tokenCache.clear();
	tokenByIdCache.clear();
}

/**
 * Get token metadata by ID from the supported_tokens table
 * @param tokenId The token UUID from supported_tokens table
 * @returns TokenMetadata if found and active, null if not found
 */
export async function getTokenMetadataById(tokenId: string): Promise<TokenMetadata | null> {
	// Check cache first
	if (tokenByIdCache.has(tokenId)) {
		return tokenByIdCache.get(tokenId) || null;
	}

	try {
		const client = supabase;

		const { data, error } = await client
			.from('supported_tokens')
			.select('*')
			.eq('id', tokenId)
			.eq('is_active', true)
			.single();

		if (error || !data) {
			tokenByIdCache.set(tokenId, null);
			return null;
		}

		// Cache the result
		tokenByIdCache.set(tokenId, data);
		return data;
	} catch (error) {
		console.error('Error fetching token metadata by ID:', error);
		tokenByIdCache.set(tokenId, null);
		return null;
	}
}

/**
 * Get policy_id and asset_name from token_id
 * @param tokenId The token UUID from supported_tokens table
 * @returns Object with policy_id and asset_name, null if not found
 */
export async function getTokenIdentifierById(
	tokenId: string,
): Promise<{ policy_id: string; asset_name: string } | null> {
	const metadata = await getTokenMetadataById(tokenId);
	if (!metadata) {
		return null;
	}

	return {
		policy_id: metadata.policy_id,
		asset_name: metadata.asset_name,
	};
}

/**
 * Add or update token metadata
 * @param metadata Token metadata to upsert
 * @returns Success status
 */
export async function upsertTokenMetadata(
	metadata: Omit<TokenMetadata, 'id' | 'created_at' | 'updated_at'>,
): Promise<boolean> {
	try {
		const client = supabase;

		const { error } = await client.from('supported_tokens').upsert(metadata, {
			onConflict: 'policy_id,asset_name',
		});

		if (error) {
			console.error('Error upserting token metadata:', error);
			return false;
		}

		// Clear cache for this token
		const cacheKey = `${metadata.policy_id}:${metadata.asset_name}`;
		tokenCache.delete(cacheKey);

		return true;
	} catch (error) {
		console.error('Error upserting token metadata:', error);
		return false;
	}
}
