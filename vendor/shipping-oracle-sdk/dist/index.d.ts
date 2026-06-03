/**
 * Public entrypoint for the Shipping Oracle TypeScript SDK.
 *
 * Re-exports the full public API: client, verification, CBOR encoder, error
 * types, and wire types.
 */
export { OracleClient } from "./client.js";
export type { OracleClientOptions } from "./client.js";
export { verifyAttestation } from "./verify.js";
export type { VerifyOptions } from "./verify.js";
export { encodeOracleDataCbor } from "./cbor.js";
export { OracleSdkError } from "./error.js";
export type { OracleSdkErrorCode } from "./error.js";
export type { OracleStatus, OracleData, ShipmentPlaintext, OracleAttestation, HealthResponse, PreparedCommitment, } from "./types.js";
