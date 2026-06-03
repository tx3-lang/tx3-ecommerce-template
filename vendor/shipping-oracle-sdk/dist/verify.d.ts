/**
 * Attestation verification for the Shipping Oracle SDK.
 *
 * Ports sdk/rust/src/verify.rs exactly.  The verification order is:
 *   1. Decode & optionally pin public key (32 bytes)
 *   2. Decode signature (64 bytes), Ed25519-verify over raw cbor_hex bytes
 *   3. Re-encode data → must match cbor_hex bytes
 *   4. blake2b-256(utf8(carrier))   == data.carrier_hash
 *      blake2b-256(utf8(tracking))  == data.tracking_number_hash
 */
import type { OracleAttestation } from "./types.js";
export interface VerifyOptions {
    /** If set, the attestation's public_key must equal this hex string exactly. */
    expectedPublicKeyHex?: string;
}
/**
 * Verify an oracle attestation.
 *
 * Returns `void` on success.  Throws `OracleSdkError` on any failure:
 *   - `INVALID_LENGTH`              — bad hex length for public_key or signature
 *   - `UNEXPECTED_PUBLIC_KEY`       — public key does not match expectedPublicKeyHex
 *   - `INVALID_SIGNATURE`           — Ed25519 verification failed
 *   - `CBOR_MISMATCH`               — re-encoded data ≠ cbor_hex
 *   - `CARRIER_HASH_MISMATCH`       — blake2b-256(carrier) ≠ data.carrier_hash
 *   - `TRACKING_NUMBER_HASH_MISMATCH` — blake2b-256(tracking_number) ≠ data.tracking_number_hash
 */
export declare function verifyAttestation(attestation: OracleAttestation, options?: VerifyOptions): void;
