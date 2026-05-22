/**
 * Escrow policy loader.
 *
 * Loads the compiled Plutus validator from `aiken/plutus.json`, derives the
 * script address for the current network, and exposes the timeout constants
 * that govern escrow lifecycle deadlines.
 *
 * Timeout env vars (in seconds):
 *   ESCROW_SHIP_DEADLINE_SECONDS  — How long the merchant has to ship.
 *                                   Default: 2592000 (30 days).
 *                                   Preview demo: 300 (5 min).
 *   ESCROW_GRACE_PERIOD_SECONDS   — Grace period after the ship deadline for
 *                                   buyer to raise a dispute.
 *                                   Default: 1209600 (14 days).
 *                                   Preview demo: 300 (5 min).
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { bech32 } from 'bech32';
import { getNetworkConfig } from './network.js';

const DEFAULT_SHIP_DEADLINE_SECONDS = 2592000; // 30 days
const DEFAULT_GRACE_PERIOD_SECONDS = 1209600; // 14 days

// Name of the spend validator in the compiled plutus.json
const SPEND_VALIDATOR_TITLE = 'escrow.escrow.spend';

interface PlutusValidator {
	title: string;
	hash: string;
}

interface PlutusJson {
	validators: PlutusValidator[];
}

/**
 * Reads `aiken/plutus.json` from the project root and returns the parsed
 * content. Throws if the file cannot be found or parsed.
 */
function loadPlutusJson(): PlutusJson {
	const filePath = path.join(process.cwd(), 'aiken', 'plutus.json');
	const raw = readFileSync(filePath, 'utf-8');
	return JSON.parse(raw) as PlutusJson;
}

/**
 * Returns the bech32 enterprise script address for the escrow validator,
 * derived from the script hash in `aiken/plutus.json`.
 *
 * - For `local` and `preview` profiles, the address uses the `addr_test` prefix
 *   and a testnet network tag (0).
 * - (Mainnet would use `addr` prefix and network tag 1 — not currently a valid
 *   profile in this app, but the logic is present for completeness.)
 */
export function getScriptAddress(): string {
	const config = getNetworkConfig();
	// Both current profiles ('local' and 'preview') are testnet networks.
	// This variable is kept explicit so the mainnet path is obvious if a
	// 'mainnet' profile is added to NetworkProfile in the future.
	const isTestnet = config.profile === 'local' || config.profile === 'preview';

	const plutus = loadPlutusJson();
	const validator = plutus.validators.find(v => v.title === SPEND_VALIDATOR_TITLE);
	if (!validator) {
		throw new Error(`MISSING_VALIDATOR: Could not find "${SPEND_VALIDATOR_TITLE}" in aiken/plutus.json`);
	}

	const hashBytes = Buffer.from(validator.hash, 'hex');

	// Cardano enterprise address encoding:
	//   header byte: 0x70 (enterprise script) | network_tag (0=testnet, 1=mainnet)
	//   payload: [header_byte, ...script_hash_bytes] — 29 bytes total
	const networkTag = isTestnet ? 0 : 1;
	const headerByte = 0x70 | networkTag;
	const payload = Buffer.concat([Buffer.from([headerByte]), hashBytes]);

	const prefix = isTestnet ? 'addr_test' : 'addr';
	const words = bech32.toWords(payload);
	return bech32.encode(prefix, words, 1000);
}

/**
 * Returns how many seconds the merchant has to ship after an order is placed.
 * Reads from `ESCROW_SHIP_DEADLINE_SECONDS`; defaults to 2592000 (30 days).
 */
export function getShipDeadlineSeconds(): number {
	const raw = process.env.ESCROW_SHIP_DEADLINE_SECONDS;
	if (raw !== undefined && raw !== '') {
		return Number(raw);
	}
	return DEFAULT_SHIP_DEADLINE_SECONDS;
}

/**
 * Returns the grace period in seconds after the ship deadline during which a
 * buyer may raise a dispute. Reads from `ESCROW_GRACE_PERIOD_SECONDS`;
 * defaults to 1209600 (14 days).
 */
export function getGracePeriodSeconds(): number {
	const raw = process.env.ESCROW_GRACE_PERIOD_SECONDS;
	if (raw !== undefined && raw !== '') {
		return Number(raw);
	}
	return DEFAULT_GRACE_PERIOD_SECONDS;
}
