/**
 * Unified Multi-Currency Formatter with Hex Support
 *
 * Supports ADA (lovelace) and Cardano tokens with proper formatting
 * ADA: 1 ADA = 1,000,000 lovelace
 * Tokens: Variable decimals based on token specification
 * Hex encoding/decoding using TextEncoder/TextDecoder
 */

// === HEX ENCODING/DECODING ===
/**
 * Convert hex string to readable ASCII using TextDecoder
 * @param hex Hex string to decode
 * @returns Decoded readable string or fallback format
 */
export function hexToAscii(hex: string): string {
	if (!hex) return '';
	try {
		const cleanHex = hex.replace(/^0x/, '');
		const uint8Array = new Uint8Array(cleanHex.length / 2);
		for (let i = 0; i < cleanHex.length; i += 2) {
			uint8Array[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
		}
		return new TextDecoder().decode(uint8Array);
	} catch {
		return `Token (${hex.slice(0, 8)}...)`;
	}
}

/**
 * Convert ASCII string to hex using TextEncoder
 * @param ascii ASCII string to encode
 * @returns Hex string representation
 */
export function asciiToHex(ascii: string): string {
	if (!ascii) return '';
	try {
		const uint8Array = new TextEncoder().encode(ascii);
		return Array.from(uint8Array)
			.map(byte => byte.toString(16).padStart(2, '0'))
			.join('');
	} catch {
		return '';
	}
}

// === CURRENCY SYMBOLS ===
export const ADA_SYMBOL = '₳';
export const TOKEN_SYMBOL = 'Token';

// === CURRENCY TYPE DEFINITIONS ===
export interface CurrencyInfo {
	type: 'ADA' | 'TOKEN';
	symbol: string;
	decimals: number;
}

// === CURRENCY DETECTION ===
/**
 * Determine if currency is ADA (both policyId and assetName are null)
 */
export function isAdaCurrency(policyId: string | null, assetName: string | null): boolean {
	return policyId === null && assetName === null;
}

/**
 * Determine if currency is ADA by token_id (null indicates ADA)
 */
export function isAdaCurrencyById(tokenId: string | null): boolean {
	return tokenId === null;
}

/**
 * Get currency type by token_id
 */
export function getCurrencyTypeById(tokenId: string | null): 'ADA' | 'TOKEN' {
	return isAdaCurrencyById(tokenId) ? 'ADA' : 'TOKEN';
}

// === CURRENCY SYMBOL GETTER ===
/**
 * Get currency symbol for display
 * ADA: ₳
 * Tokens: decoded token name
 */
export function getCurrencySymbol(
	policyId: string | null,
	assetName: string | null,
	supportedToken?: {
		display_name?: string | null;
		asset_name?: string | null;
	} | null,
): string {
	if (isAdaCurrency(policyId, assetName)) {
		return ADA_SYMBOL;
	}

	// Use display_name if available
	if (supportedToken?.display_name) {
		return supportedToken.display_name;
	}

	// Use hex-decoded asset_name if available
	if (supportedToken?.asset_name) {
		return hexToAscii(supportedToken.asset_name) || TOKEN_SYMBOL;
	}

	// Fallback to original behavior
	if (assetName && policyId) {
		return formatTokenName(assetName, policyId);
	}

	return TOKEN_SYMBOL;
}

// === KEY MANAGEMENT ===
/**
 * Create unique currency key for grouping and storage
 */
export function createCurrencyKey(policyId: string | null, assetName: string | null): string {
	if (isAdaCurrency(policyId, assetName)) {
		return 'ADA';
	}
	return `${policyId}:${assetName}`;
}

/**
 * Create unique currency key by token_id
 */
export function createCurrencyKeyById(tokenId: string | null): string {
	if (isAdaCurrencyById(tokenId)) {
		return 'ADA';
	}
	// biome-ignore lint/style/noNonNullAssertion: we validate is not null on isAdaCurrencyById
	return tokenId!;
}

// === GROUPING UTILITIES ===
/**
 * Group items by currency for calculations and display
 */
export function groupItemsByCurrency<T extends { policy_id: string | null; asset_name: string | null }>(
	items: T[],
): Record<string, T[]> {
	return items.reduce(
		(groups, item) => {
			const key = createCurrencyKey(item.policy_id, item.asset_name);
			if (!groups[key]) {
				groups[key] = [];
			}
			groups[key].push(item);
			return groups;
		},
		{} as Record<string, T[]>,
	);
}

/**
 * Group items by currency using token_id
 */
export function groupItemsByCurrencyById<T extends { token_id: string | null }>(items: T[]): Record<string, T[]> {
	return items.reduce(
		(groups, item) => {
			const key = createCurrencyKeyById(item.token_id);
			if (!groups[key]) {
				groups[key] = [];
			}
			groups[key].push(item);
			return groups;
		},
		{} as Record<string, T[]>,
	);
}

/**
 * Convert lovelace to ADA with proper decimal formatting
 */
export function formatLovelaceToAda(lovelace: number, decimals: number = 6): string {
	if (typeof lovelace !== 'number' || Number.isNaN(lovelace)) {
		return `0.000000 ${ADA_SYMBOL}`;
	}

	const ada = lovelace / 1_000_000;
	return `${ada.toFixed(decimals)} ${ADA_SYMBOL}`;
}

// === MULTI-CURRENCY FORMATTING ===
/**
 * Synchronous version of formatPrice for backward compatibility
 * Uses cached token metadata or safe defaults when metadata is not available
 */
export function formatPriceSync(
	price: number,
	policyId: string | null,
	assetName: string | null,
	options: {
		showSymbol?: boolean;
		decimals?: number;
		compact?: boolean;
	} = {},
): string {
	const { showSymbol = true, decimals, compact = false } = options;

	// Handle ADA (default case)
	if (!policyId && !assetName) {
		const finalDecimals = decimals ?? 6;
		const displayAmount = price / 1_000_000;

		if (compact && displayAmount >= 1_000_000) {
			return `${(displayAmount / 1_000_000).toFixed(2)}M ₳`;
		}

		if (compact && displayAmount >= 1_000) {
			return `${(displayAmount / 1_000).toFixed(2)}K ₳`;
		}

		const formatted = displayAmount.toFixed(finalDecimals);
		return showSymbol ? `${formatted} ₳` : formatted;
	}

	// Handle tokens with fallback logic
	const finalDecimals = decimals ?? 0;
	const displayAmount = price / 10 ** finalDecimals;
	const tokenSymbol = assetName ? hexToAscii(assetName) || `Token(${assetName.slice(0, 8)}...)` : 'TOKEN';

	if (compact && displayAmount >= 1_000_000) {
		return `${(displayAmount / 1_000_000).toFixed(2)}M ${tokenSymbol}`;
	}

	if (compact && displayAmount >= 1_000) {
		return `${(displayAmount / 1_000).toFixed(2)}K ${tokenSymbol}`;
	}

	const formatted = displayAmount.toFixed(finalDecimals);
	return showSymbol ? `${formatted} ${tokenSymbol}` : formatted;
}

/**
 * Synchronous version of formatPriceById for backward compatibility
 * Uses safe defaults when metadata is not available
 */
export function formatPriceSyncById(
	price: number,
	tokenId: string | null,
	options: {
		showSymbol?: boolean;
		decimals?: number;
		compact?: boolean;
		supportedToken?: Database.SupportedToken | null;
	} = {},
): string {
	const { showSymbol = true, decimals, compact = false, supportedToken } = options;

	// Handle ADA (default case)
	if (!tokenId) {
		const finalDecimals = decimals ?? 6;
		const displayAmount = price / 1_000_000;

		if (compact && displayAmount >= 1_000_000) {
			return `${(displayAmount / 1_000_000).toFixed(2)}M ₳`;
		}

		if (compact && displayAmount >= 1_000) {
			return `${(displayAmount / 1_000).toFixed(2)}K ₳`;
		}

		const formatted = displayAmount.toFixed(finalDecimals);
		return showSymbol ? `${formatted} ₳` : formatted;
	}

	// Handle tokens with fallback logic
	const finalDecimals = decimals ?? supportedToken?.decimals ?? 6;
	const displayAmount = price / 10 ** finalDecimals;

	// Use display_name if available, otherwise hex-decoded asset_name, otherwise fallback
	let tokenSymbol: string;
	if (supportedToken?.display_name) {
		tokenSymbol = supportedToken.display_name;
	} else if (supportedToken?.asset_name) {
		tokenSymbol = hexToAscii(supportedToken.asset_name) || `Token(${tokenId?.slice(0, 8)}...)`;
	} else {
		tokenSymbol = `Token(${tokenId?.slice(0, 8)}...)`;
	}

	if (compact && displayAmount >= 1_000_000) {
		return `${(displayAmount / 1_000_000).toFixed(2)}M ${tokenSymbol}`;
	}

	if (compact && displayAmount >= 1_000) {
		return `${(displayAmount / 1_000).toFixed(2)}K ${tokenSymbol}`;
	}

	const formatted = displayAmount.toFixed(finalDecimals);
	return showSymbol ? `${formatted} ${tokenSymbol}` : formatted;
}

/**
 * Format token name from hex to readable ASCII
 * @param assetName Token asset name in hex
 * @param policyId Token policy ID
 * @returns Readable token name or fallback
 */
export function formatTokenName(assetName: string | null, policyId: string | null): string {
	if (!assetName) return 'ADA'; // This shouldn't happen for tokens, but fallback
	if (!policyId) return 'Unknown Token';

	return hexToAscii(assetName);
}

/**
 * Convert price amount to smallest unit based on decimals
 * @param price Price amount in regular units
 * @param supportedToken Token information for decimals
 * @param decimals Number of decimals (fallback)
 * @returns Price in smallest unit (e.g., 5 ADA -> 5000000)
 */
export function convertToSmallestUnit(
	price: number,
	supportedToken?: Database.SupportedToken | null,
	decimals: number = 6,
): number {
	const finalDecimals = supportedToken?.decimals ?? decimals;
	return Math.floor(price * 10 ** finalDecimals);
}

/**
 * Convert price amount from smallest unit to regular units based on decimals
 * @param price Price amount in smallest unit
 * @param supportedToken Token information for decimals
 * @param decimals Number of decimals (fallback)
 * @returns Price in regular units (e.g., 5000000 -> 5)
 */
export function convertFromSmallestUnit(
	price: number,
	supportedToken?: Database.SupportedToken | null,
	decimals: number = 6,
): number {
	const finalDecimals = supportedToken?.decimals ?? decimals;
	return price / 10 ** finalDecimals;
}
