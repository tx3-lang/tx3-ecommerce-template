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
 *   - getPolicyId()             — merchant_pkh → policy_id
 *   - getAppliedScriptCbor()    — merchant_pkh → applied script CBOR
 *   - Client (tx3 protocol)     — mintBadge + submit
 */

import { blake2b } from '@noble/hashes/blake2.js';
import { Buffer } from 'buffer';

import type { TxEnvelope } from 'tx3-sdk/trp';
import type { ProfileName } from '@/lib/tx3/protocol';
import { Client } from '@/lib/tx3/protocol';

import { deriveAssetName } from './badges-asset-name.js';
import type { BadgeKind } from './badges-catalog.js';
import { getCatalogEntry } from './badges-catalog.js';
import { getAppliedScriptCbor, getPolicyId } from './badges-policy.js';
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
	const { trpEndpoint, profile, merchantAddress } = getNetworkConfig();

	const entry = getCatalogEntry(kind);

	const pubKeyBytes = Buffer.from(getMerchantSigner().publicKeyHex(), 'hex');
	const merchantPkh = Buffer.from(blake2b(pubKeyBytes, { dkLen: 28 })).toString('hex');

	const policyId = getPolicyId(merchantPkh);
	const appliedScriptCbor = getAppliedScriptCbor(merchantPkh);
	const assetName = deriveAssetName(kind, recipientPkh);

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

	const metadataHex = Buffer.from(JSON.stringify(metadata), 'utf8').toString('hex');

	const client = new Client({ endpoint: trpEndpoint }, profile as ProfileName);

	const envelope: TxEnvelope = await client.mintBadge({
		appliedScriptCbor,
		assetName,
		metadata: metadataHex,
		policyId,
		recipientAddress,
	});

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
