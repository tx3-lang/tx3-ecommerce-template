/**
 * u5c provider wrapper.
 *
 * Thin, mockable interface over the tx3-sdk TRP Client. Downstream code calls
 * resolve() and submit() through this wrapper; the concrete TRP endpoint is
 * read from the network config at construction time.
 *
 * All errors thrown by the underlying Client are caught and re-thrown as a
 * typed ChainUnavailable error so callers have a single error type to handle.
 *
 * Built against tx3-sdk@0.11.0:
 *   - TrpClient.resolve(ResolveParams): Promise<TxEnvelope>
 *   - TrpClient.submit(SubmitParams): Promise<SubmitResponse>
 *   - TrpClient.checkStatus(hashes): Promise<CheckStatusResponse>
 *   - BytesEnvelope now uses `contentType: "hex"` instead of `encoding: "hex"`.
 */

import type { ResolveParams, SubmitParams, SubmitResponse, TxEnvelope } from 'tx3-sdk/trp';
import { TrpClient } from 'tx3-sdk/trp';
import type { NetworkConfig } from './network.js';
import { getNetworkConfig } from './network.js';

// Re-export SDK types so callers can reference them without importing tx3-sdk directly
export type { ResolveParams, SubmitParams, SubmitResponse, TxEnvelope };

/**
 * Typed error that wraps any network / transport failure from the TRP Client.
 * The original error is always attached as `cause`.
 */
export class ChainUnavailable extends Error {
	override readonly cause: unknown;

	constructor(message: string, cause: unknown) {
		super(message);
		this.name = 'ChainUnavailable';
		this.cause = cause;
	}
}

/**
 * Thin interface over the TRP Client. Only the methods needed by the
 * traceability orchestrator are exposed.
 */
export interface U5cClient {
	/**
	 * Resolve a proto-transaction to a concrete signed transaction envelope.
	 * Forwards directly to TrpClient.resolve().
	 */
	resolve(params: ResolveParams): Promise<TxEnvelope>;

	/**
	 * Submit a signed transaction to the network.
	 * Forwards directly to TrpClient.submit().
	 */
	submit(params: SubmitParams): Promise<SubmitResponse>;
}

/**
 * Factory that creates a U5cClient backed by the real TrpClient.
 *
 * @param config - Optional network config override (useful for tests). When
 *   omitted, the config is read from environment variables via getNetworkConfig().
 */
export function createU5cClient(config?: NetworkConfig): U5cClient {
	const { trpEndpoint } = config ?? getNetworkConfig();
	const inner = new TrpClient({ endpoint: trpEndpoint });

	return {
		async resolve(params: ResolveParams): Promise<TxEnvelope> {
			try {
				return await inner.resolve(params);
			} catch (err) {
				throw new ChainUnavailable(`TRP resolve failed: ${err instanceof Error ? err.message : String(err)}`, err);
			}
		},

		async submit(params: SubmitParams): Promise<SubmitResponse> {
			try {
				return await inner.submit(params);
			} catch (err) {
				throw new ChainUnavailable(`TRP submit failed: ${err instanceof Error ? err.message : String(err)}`, err);
			}
		},
	};
}
