/**
 * Badges orchestrator.
 *
 * Builds the CIP-25 metadata payload, derives the asset_name, drives the
 * tx3-sdk resolve → sign → submit pipeline, and returns the minting result.
 *
 * Relies on:
 *   - getNetworkConfig()        — trpEndpoint, profile, merchantAddress
 *   - getMerchantSigner()       — Ed25519 signing + publicKeyHex
 *   - getCatalogEntry()         — badge kind → catalog metadata
 *   - deriveAssetName()         — badge kind + recipient_pkh → asset_name
 *   - getPolicyId()             — badges minting policy id (config)
 *   - getBadgeScriptRefUtxo()   — published reference-script UTxO (env)
 *   - Client (tx3 protocol)     — mintBadge + submit
 */

import { Buffer } from 'buffer';

import type { TxEnvelope } from 'tx3-sdk/trp';
import type { ProfileName } from '@/lib/tx3/protocol';
import { Client } from '@/lib/tx3/protocol';

import { deriveAssetName } from './badges-asset-name.js';
import type { BadgeKind } from './badges-catalog.js';
import { getCatalogEntry } from './badges-catalog.js';
import { getBadgeScriptRefUtxo, getPolicyId } from './badges-policy.js';
import { getNetworkConfig } from './network.js';
import { getMerchantSigner } from './signer.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MintBadgeResult {
	assetName: string;
	txHash: string;
	metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function submitMintBadge(
	kind: BadgeKind,
	recipientPkh: string,
	recipientAddress: string,
	orderId: string,
): Promise<MintBadgeResult> {
	const { trpEndpoint, trpApiKey, profile, merchantAddress } = getNetworkConfig();

	const entry = getCatalogEntry(kind);

	const policyId = getPolicyId();
	const scriptRef = getBadgeScriptRefUtxo();
	const assetName = deriveAssetName(kind, recipientPkh);

	// Rich CIP-25-style payload — kept for the off-chain issued_badges record and
	// app display only. It is NOT what goes on chain: tx3 cannot emit nested
	// CIP-25 maps (only primitive Int/String/Bytes values, each ≤ 64 bytes), so
	// the on-chain metadata is a single short label below.
	const metadata: Record<string, unknown> = {
		'721': {
			[policyId]: {
				[assetName]: {
					name: entry.name,
					image: entry.ipfs_image_cid.startsWith('ipfs://') ? entry.ipfs_image_cid : `ipfs://${entry.ipfs_image_cid}`,
					description: entry.description,
					mediaType: 'image/png',
					kind,
					order_id: orderId,
					merchant: merchantAddress,
					issued_at: new Date().toISOString(),
				},
			},
		},
	};

	// On-chain metadata: the badge `kind` as a single primitive value (≤ 64 bytes),
	// the most tx3/Cardano allow under one label without nested maps.
	const onChainMetadataHex = Buffer.from(kind, 'utf8').subarray(0, 64).toString('hex');

	// mint_badge uses the `Merchant` party (from/to/signers), so the merchant
	// address must be injected just like escrow/traceability do — otherwise the
	// resolver reports a missing `merchant` party.
	const client = new Client(
		{ endpoint: trpEndpoint, ...(trpApiKey ? { headers: { 'dmtr-api-key': trpApiKey } } : {}) },
		profile as ProfileName,
		{ merchant: merchantAddress },
	);

	// The TRP resolver matches args by their ORIGINAL .tx3 (snake_case) names, not
	// the camelCase the codegen types expose — pass snake_case and cast. The
	// minting script comes from the published reference UTxO (badge_script_ref),
	// passed as the "<txid>#<index>" wire form; recipient_address is an `Address`
	// (bech32). The policy id is config (`BadgeMint` in main.tx3).
	const envelope: TxEnvelope = await client.mintBadge({
		asset_name: assetName,
		badge_script_ref: `${scriptRef.txHash}#${scriptRef.outputIndex}`,
		recipient_address: recipientAddress,
		metadata: onChainMetadataHex,
	} as unknown as Parameters<typeof client.mintBadge>[0]);

	console.log(envelope);

	const witnesses = getMerchantSigner().sign(envelope.hash);

	await client.submit({
		tx: { content: envelope.tx, contentType: 'hex' },
		witnesses,
	});

	return {
		assetName,
		txHash: envelope.hash,
		metadata,
	};
}
