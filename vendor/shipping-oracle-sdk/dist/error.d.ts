/**
 * Error type for the Shipping Oracle SDK.
 * Mirrors the variant names from sdk/rust/src/error.rs.
 */
/** Discriminated error codes covering every failure mode in the SDK. */
export type OracleSdkErrorCode = "API" | "INVALID_LENGTH" | "RESPONSE_MISMATCH" | "UNEXPECTED_PUBLIC_KEY" | "INVALID_SIGNATURE" | "CBOR_MISMATCH" | "CARRIER_HASH_MISMATCH" | "TRACKING_NUMBER_HASH_MISMATCH";
/** Structured error thrown by the Shipping Oracle SDK. */
export declare class OracleSdkError extends Error {
    readonly name = "OracleSdkError";
    readonly code: OracleSdkErrorCode;
    constructor(code: OracleSdkErrorCode, message: string);
}
