/**
 * Badges policy loader.
 *
 * Loads the compiled badges minting validator from `aiken/plutus.json`,
 * applies the merchant verification key hash parameter, and derives the
 * deterministic policy_id via blake2b-224.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { blake2b } from '@noble/hashes/blake2.js';
import { Buffer } from 'buffer';

const MINT_VALIDATOR_TITLE = 'badges.badges.mint';

interface PlutusParameter {
	title: string;
	schema: Record<string, string>;
}

interface PlutusValidator {
	title: string;
	compiledCode: string;
	hash: string;
	parameters?: PlutusParameter[];
}

interface PlutusJson {
	validators: PlutusValidator[];
}

function loadPlutusJson(): PlutusJson {
	const filePath = path.join(process.cwd(), 'aiken', 'plutus.json');
	const raw = readFileSync(filePath, 'utf-8');
	return JSON.parse(raw) as PlutusJson;
}

/**
 * Encodes a 28-byte verification key hash as a Plutus V3 CBOR parameter.
 *
 * In Plutus V3, a VerificationKeyHash (ByteArray) is encoded as a CBOR
 * byte string: major type 2 with the length prefix.
 *
 * For 28 bytes (< 24), this is 0x5c (0x40 | 0x1c) followed by the 28 bytes.
 */
function encodeParameter(pkhBytes: Buffer): Buffer {
	return Buffer.concat([Buffer.from([0x5c]), pkhBytes]);
}

/**
 * Builds the applied Plutus V3 script bytes for policy_id derivation.
 *
 * Cardano policy_id = blake2b-224(serialized_script).
 * For parameterized Plutus V3 scripts, the applied script =
 *   CBOR-encoded parameter(s) + compiled code.
 */
function buildAppliedScript(merchantPkhHex: string): Buffer {
	const pkhBytes = Buffer.from(merchantPkhHex, 'hex');
	const parameterBytes = encodeParameter(pkhBytes);
	const compiledCodeBytes = getCompiledCodeBytes();
	return Buffer.concat([parameterBytes, compiledCodeBytes]);
}

function getCompiledCodeBytes(): Buffer {
	const plutus = loadPlutusJson();
	const validator = plutus.validators.find(v => v.title === MINT_VALIDATOR_TITLE);
	if (!validator) {
		throw new Error(`MISSING_VALIDATOR: Could not find "${MINT_VALIDATOR_TITLE}" in aiken/plutus.json`);
	}
	return Buffer.from(validator.compiledCode, 'hex');
}

/**
 * Returns the deterministic 28-byte (56 hex chars) policy_id for the badges
 * minting policy, derived from the blake2b-224 hash of the applied script.
 *
 * @param merchantPkhHex - 28-byte (56 hex chars) verification key hash
 */
export function getPolicyId(merchantPkhHex: string): string {
	const appliedScript = buildAppliedScript(merchantPkhHex);
	const hash = blake2b(appliedScript, { dkLen: 28 });
	return Buffer.from(hash).toString('hex');
}

/**
 * Returns the raw compiled CBOR script bytes (hex string) from plutus.json
 * for the badges minting validator.
 */
export function getBadgesScriptCbor(): string {
	const plutus = loadPlutusJson();
	const validator = plutus.validators.find(v => v.title === MINT_VALIDATOR_TITLE);
	if (!validator) {
		throw new Error(`MISSING_VALIDATOR: Could not find "${MINT_VALIDATOR_TITLE}" in aiken/plutus.json`);
	}
	return validator.compiledCode;
}
