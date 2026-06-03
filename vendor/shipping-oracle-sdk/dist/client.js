/**
 * HTTP client for the Shipping Oracle API.
 *
 * Ports sdk/rust/src/client.rs.  Uses the global `fetch` by default (Node 18+),
 * but accepts an injected `fetchFn` for testing.
 */
import { OracleSdkError } from "./error.js";
import { verifyAttestation } from "./verify.js";
// ── OracleClient ──────────────────────────────────────────────────────────────
export class OracleClient {
    baseUrl;
    expectedPublicKeyHex;
    fetchFn;
    /**
     * @param baseUrl  Base URL of the oracle HTTP API (trailing slashes are trimmed).
     * @param options  Optional configuration.
     */
    constructor(baseUrl, options) {
        // Trim any trailing slashes so URL concatenation is always clean.
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.expectedPublicKeyHex = options?.expectedPublicKeyHex;
        this.fetchFn = options?.fetchFn ?? globalThis.fetch;
    }
    // ── Public methods ──────────────────────────────────────────────────────────
    /** GET {base}/health */
    async health() {
        return this.getJson(`${this.baseUrl}/health`, {});
    }
    /**
     * GET {base}/v1/shipment?carrier=<carrier>&tracking_number=<trackingNumber>
     *
     * Returns the raw attestation from the API (no verification performed).
     */
    async fetchAttestation(carrier, trackingNumber) {
        return this.getJson(`${this.baseUrl}/v1/shipment`, {
            carrier,
            tracking_number: trackingNumber,
        });
    }
    /**
     * Fetch an attestation, assert the response matches the requested shipment,
     * verify the Ed25519 signature, then return `{ context, attestation }`.
     *
     * Throws `OracleSdkError`:
     *   - `API`              — non-2xx HTTP response
     *   - `RESPONSE_MISMATCH` — response plaintext doesn't match requested identifiers
     *   - (any error from `verifyAttestation`) — signature / CBOR / hash mismatch
     */
    async prepareCommitment(context, carrier, trackingNumber) {
        const attestation = await this.fetchAttestation(carrier, trackingNumber);
        // Guard: ensure the server returned data for the shipment we requested.
        if (attestation.plaintext.carrier !== carrier) {
            throw new OracleSdkError("RESPONSE_MISMATCH", `oracle returned carrier "${attestation.plaintext.carrier}" but "${carrier}" was requested`);
        }
        if (attestation.plaintext.tracking_number !== trackingNumber) {
            throw new OracleSdkError("RESPONSE_MISMATCH", `oracle returned tracking_number "${attestation.plaintext.tracking_number}" but "${trackingNumber}" was requested`);
        }
        // Cryptographic verification (throws OracleSdkError on any failure).
        verifyAttestation(attestation, {
            expectedPublicKeyHex: this.expectedPublicKeyHex,
        });
        return { context, attestation };
    }
    // ── Private helpers ─────────────────────────────────────────────────────────
    /**
     * Build a URL with query params, perform a GET, and return the parsed JSON.
     *
     * Throws `OracleSdkError('API', ...)` on non-2xx responses.
     */
    async getJson(url, params) {
        const fullUrl = new URL(url);
        for (const [key, value] of Object.entries(params)) {
            fullUrl.searchParams.set(key, value);
        }
        const response = await this.fetchFn(fullUrl.toString());
        if (!response.ok) {
            const body = await response.text();
            throw new OracleSdkError("API", `oracle returned http ${response.status}: ${body}`);
        }
        return response.json();
    }
}
