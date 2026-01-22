/**
 * ADA Currency Utilities
 *
 * Cardano uses lovelace as the smallest unit where 1 ADA = 1,000,000 lovelace
 * These utilities help convert between the two units with proper formatting
 */

export const ADA_SYMBOL = '₳';

/**
 * Convert lovelace to ADA with proper decimal formatting
 * @param lovelace Amount in lovelace
 * @param decimals Number of decimal places to show (default: 6)
 * @returns Formatted ADA string
 */
export function formatLovelaceToAda(lovelace: number, decimals: number = 6): string {
	if (typeof lovelace !== 'number' || Number.isNaN(lovelace)) {
		return `0.000000 ${ADA_SYMBOL}`;
	}

	const ada = lovelace / 1_000_000;
	return `${ada.toFixed(decimals)} ${ADA_SYMBOL}`;
}

/**
 * Convert ADA to lovelace
 * @param ada Amount in ADA
 * @returns Amount in lovelace (integer)
 */
export function formatAdaToLovelace(ada: number): number {
	if (typeof ada !== 'number' || Number.isNaN(ada)) {
		return 0;
	}

	return Math.round(ada * 1_000_000);
}

/**
 * Format ADA amount for display with optional symbol
 * @param lovelace Amount in lovelace
 * @param options Formatting options
 * @returns Formatted string
 */
export function formatAdaDisplay(
	lovelace: number,
	options: {
		showSymbol?: boolean;
		decimals?: number;
		compact?: boolean;
	} = {},
): string {
	const { showSymbol = true, decimals = 6, compact = false } = options;

	const ada = lovelace / 1_000_000;

	if (compact && ada >= 1_000_000) {
		return `${(ada / 1_000_000).toFixed(2)}M ${ADA_SYMBOL}`;
	}

	if (compact && ada >= 1_000) {
		return `${(ada / 1_000).toFixed(2)}K ${ADA_SYMBOL}`;
	}

	const formatted = ada.toFixed(decimals);
	return showSymbol ? `${formatted} ${ADA_SYMBOL}` : formatted;
}

/**
 * Parse ADA string to lovelace number
 * @param adaString ADA amount as string (e.g., "10.5 ADA" or "10.5")
 * @returns Amount in lovelace
 */
export function parseAdaToLovelace(adaString: string): number {
	if (!adaString || typeof adaString !== 'string') {
		return 0;
	}

	// Remove "ADA" suffix and whitespace
	const cleanValue = adaString.replace(/ADA/gi, '').trim();

	// Parse as number
	const ada = parseFloat(cleanValue);

	if (Number.isNaN(ada)) {
		return 0;
	}

	return formatAdaToLovelace(ada);
}

/**
 * Validate if a lovelace amount is within valid range
 * @param lovelace Amount in lovelace to validate
 * @returns True if valid
 */
export function isValidLovelaceAmount(lovelace: number): boolean {
	return (
		typeof lovelace === 'number' && Number.isInteger(lovelace) && lovelace >= 0 && lovelace <= 45_000_000_000_000_000 // 45 billion ADA max
	);
}

/**
 * Get 1 ADA in lovelace
 */
export const ADA_IN_LOVELACE = 1_000_000;

/**
 * Format lovelace as currency string with proper locale formatting
 * @param lovelace Amount in lovelace
 * @param locale Locale for formatting (default: 'en-US')
 * @returns Formatted currency string
 */
export function formatLovelaceAsCurrency(lovelace: number, locale: string = 'en-US'): string {
	const ada = lovelace / 1_000_000;

	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: ADA_SYMBOL,
		minimumFractionDigits: 6,
		maximumFractionDigits: 6,
	})
		.format(ada)
		.trim();
}
