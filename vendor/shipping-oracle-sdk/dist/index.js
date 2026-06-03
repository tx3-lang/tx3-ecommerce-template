/**
 * Public entrypoint for the Shipping Oracle TypeScript SDK.
 *
 * Re-exports the full public API: client, verification, CBOR encoder, error
 * types, and wire types.
 */
// ── Client ────────────────────────────────────────────────────────────────────
export { OracleClient } from "./client.js";
// ── Verification ──────────────────────────────────────────────────────────────
export { verifyAttestation } from "./verify.js";
// ── CBOR encoder ─────────────────────────────────────────────────────────────
export { encodeOracleDataCbor } from "./cbor.js";
// ── Error ─────────────────────────────────────────────────────────────────────
export { OracleSdkError } from "./error.js";
