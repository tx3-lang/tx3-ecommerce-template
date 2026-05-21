/**
 * Network configuration loader.
 *
 * Single source of truth for runtime chain configuration. Reads required env
 * vars once, validates them, and memoises the result. Throws loudly (with a
 * descriptive `MISSING_ENV` or `INVALID_PROFILE` message) when required vars
 * are absent or invalid.
 *
 * Required env vars:
 *   TX3_TRP_ENDPOINT  — TRP server URL (dolos local or preview TRP)
 *   TX3_PROFILE       — "local" | "preview"
 *   MERCHANT_ADDRESS  — bech32 address of the backend signer
 *
 * Optional env vars:
 *   METADATA_LABEL    — numeric label for order-event metadata (default: 1337)
 */

export type NetworkProfile = 'local' | 'preview';

export interface NetworkConfig {
	trpEndpoint: string;
	profile: NetworkProfile;
	metadataLabel: number;
	merchantAddress: string;
}

const VALID_PROFILES: ReadonlySet<string> = new Set(['local', 'preview']);
const DEFAULT_METADATA_LABEL = 1337;

let _config: NetworkConfig | null = null;

/**
 * Returns the memoised network configuration. Throws on first call if any
 * required env var is missing or invalid.
 */
export function getNetworkConfig(): NetworkConfig {
	if (_config !== null) {
		return _config;
	}

	const trpEndpoint = requireEnv('TX3_TRP_ENDPOINT');
	const profileRaw = requireEnv('TX3_PROFILE');
	const merchantAddress = requireEnv('MERCHANT_ADDRESS');

	if (!VALID_PROFILES.has(profileRaw)) {
		throw new Error(`INVALID_PROFILE: TX3_PROFILE must be "local" or "preview", got "${profileRaw}"`);
	}

	const metadataLabelRaw = process.env.METADATA_LABEL;
	const metadataLabel = metadataLabelRaw !== undefined ? Number(metadataLabelRaw) : DEFAULT_METADATA_LABEL;

	_config = {
		trpEndpoint,
		profile: profileRaw as NetworkProfile,
		metadataLabel,
		merchantAddress,
	};

	return _config;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (value === undefined || value === '') {
		throw new Error(`MISSING_ENV: ${name}`);
	}
	return value;
}
