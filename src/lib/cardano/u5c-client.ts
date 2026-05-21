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
 * Note: tx3-sdk@0.7.0 exposes resolve() and submit() only. checkStatus() is
 * not present in the installed package version.
 */

import { Client } from 'tx3-sdk/trp';
import type { ProtoTxRequest, ResolveResponse, SubmitParams } from 'tx3-sdk/trp';
import { getNetworkConfig } from './network.js';
import type { NetworkConfig } from './network.js';

// Re-export SDK types so callers can reference them without importing tx3-sdk directly
export type { ProtoTxRequest, ResolveResponse, SubmitParams };

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
	 * Forwards directly to TRP Client.resolve().
	 */
	resolve(protoTx: ProtoTxRequest): Promise<ResolveResponse>;

	/**
	 * Submit a signed transaction to the network.
	 * Forwards directly to TRP Client.submit().
	 */
	submit(params: SubmitParams): Promise<void>;
}

/**
 * Factory that creates a U5cClient backed by the real TRP Client.
 *
 * @param config - Optional network config override (useful for tests). When
 *   omitted, the config is read from environment variables via getNetworkConfig().
 */
export function createU5cClient(config?: NetworkConfig): U5cClient {
	const { trpEndpoint } = config ?? getNetworkConfig();
	const inner = new Client({ endpoint: trpEndpoint });

	return {
		async resolve(protoTx: ProtoTxRequest): Promise<ResolveResponse> {
			try {
				return await inner.resolve(protoTx);
			} catch (err) {
				throw new ChainUnavailable(`TRP resolve failed: ${err instanceof Error ? err.message : String(err)}`, err);
			}
		},

		async submit(params: SubmitParams): Promise<void> {
			try {
				await inner.submit(params);
			} catch (err) {
				throw new ChainUnavailable(`TRP submit failed: ${err instanceof Error ? err.message : String(err)}`, err);
			}
		},
	};
}
