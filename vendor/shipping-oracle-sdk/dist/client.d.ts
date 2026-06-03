/**
 * HTTP client for the Shipping Oracle API.
 *
 * Ports sdk/rust/src/client.rs.  Uses the global `fetch` by default (Node 18+),
 * but accepts an injected `fetchFn` for testing.
 */
import type { HealthResponse, OracleAttestation, PreparedCommitment } from "./types.js";
export interface OracleClientOptions {
    /**
     * When set, `prepareCommitment` (and underlying `verifyAttestation`) will
     * assert that the attestation's public_key matches this hex string exactly.
     */
    expectedPublicKeyHex?: string;
    /**
     * Overrides the global `fetch`.  Useful for testing without a live server.
     */
    fetchFn?: typeof fetch;
}
export declare class OracleClient {
    private readonly baseUrl;
    private readonly expectedPublicKeyHex;
    private readonly fetchFn;
    /**
     * @param baseUrl  Base URL of the oracle HTTP API (trailing slashes are trimmed).
     * @param options  Optional configuration.
     */
    constructor(baseUrl: string, options?: OracleClientOptions);
    /** GET {base}/health */
    health(): Promise<HealthResponse>;
    /**
     * GET {base}/v1/shipment?carrier=<carrier>&tracking_number=<trackingNumber>
     *
     * Returns the raw attestation from the API (no verification performed).
     */
    fetchAttestation(carrier: string, trackingNumber: string): Promise<OracleAttestation>;
    /**
     * Fetch an attestation, assert the response matches the requested shipment,
     * verify the Ed25519 signature, then return `{ context, attestation }`.
     *
     * Throws `OracleSdkError`:
     *   - `API`              — non-2xx HTTP response
     *   - `RESPONSE_MISMATCH` — response plaintext doesn't match requested identifiers
     *   - (any error from `verifyAttestation`) — signature / CBOR / hash mismatch
     */
    prepareCommitment<TContext>(context: TContext, carrier: string, trackingNumber: string): Promise<PreparedCommitment<TContext>>;
    /**
     * Build a URL with query params, perform a GET, and return the parsed JSON.
     *
     * Throws `OracleSdkError('API', ...)` on non-2xx responses.
     */
    private getJson;
}
