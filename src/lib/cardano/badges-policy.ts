/**
 * Badges policy config.
 *
 * The badges minting validator is parameterized by the merchant PKH. Because the
 * merchant is fixed, the param-applied policy id is deterministic, so it lives
 * here as config — it MUST match `policy BadgeMint = 0x...` in tx3/main.tx3.
 *
 * Produced offline with Aiken (which applies the param and hashes correctly):
 *   aiken blueprint apply -m badges -v badges 581c<merchant_pkh>
 *
 * The applied minting script is NOT embedded in mint txs. It is published once
 * as a reference UTxO (a `cardano::publish` tx) and referenced at mint time via
 * BADGE_SCRIPT_REF_*.
 */

/**
 * The deterministic badges minting policy id (28-byte blake2b-224 hash of the
 * param-applied Plutus V3 script). Keep in sync with `policy BadgeMint` in
 * tx3/main.tx3 — regenerate both with `aiken blueprint apply` if the merchant
 * key changes.
 */
export const BADGE_POLICY_ID = 'd94bb23669f1dc793bafa1373b9afdb2cd5b714dbea72b92852cd513';

/** Returns the badges minting policy id. */
export function getPolicyId(): string {
	return BADGE_POLICY_ID;
}

/**
 * Returns the UTxO ref of the published badges reference script.
 *
 * Set per environment after the one-time reference-script publish:
 *   BADGE_SCRIPT_REF_TX_HASH       — hex tx hash of the publish tx
 *   BADGE_SCRIPT_REF_OUTPUT_INDEX  — index of the output carrying the script
 */
export function getBadgeScriptRefUtxo(): { txHash: string; outputIndex: number } {
	const txHash = process.env.BADGE_SCRIPT_REF_TX_HASH;
	const outputIndexRaw = process.env.BADGE_SCRIPT_REF_OUTPUT_INDEX;

	if (!txHash) {
		throw new Error('MISSING_ENV: BADGE_SCRIPT_REF_TX_HASH is required');
	}
	if (outputIndexRaw === undefined) {
		throw new Error('MISSING_ENV: BADGE_SCRIPT_REF_OUTPUT_INDEX is required');
	}

	return { txHash, outputIndex: Number(outputIndexRaw) };
}
