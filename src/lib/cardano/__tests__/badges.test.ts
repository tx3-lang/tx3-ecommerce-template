/**
 * Tests for src/lib/cardano/badges.ts
 *
 * Mocks at all external boundaries:
 *   - @/lib/tx3/protocol        — codegen Client (mintBadge + submit)
 *   - ../network.js             — getNetworkConfig
 *   - ../signer.js              — getMerchantSigner
 *
 * badges-policy is NOT mocked: getPolicyId returns the config BADGE_POLICY_ID,
 * and getBadgeScriptRefUtxo reads BADGE_SCRIPT_REF_* (set below).
 */

import { Buffer } from 'buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BADGE_POLICY_ID } from '../badges-policy.js';

// ---------------------------------------------------------------------------
// Stub constants
// ---------------------------------------------------------------------------

const STUB_PUBLIC_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const STUB_ASSET_NAME = '0001aabbccdd00112233445566778899aabbccddaabbccdd001122334455';
// bech32 address — the mint_badge `recipient_address` param is `Address`, so it
// is passed straight through as a bech32 string.
const STUB_RECIPIENT_ADDRESS = 'addr_test1vqyqxqzqgxqyqyqgxqyqyqgxqyqyqgxqyqyqgxqyqgxq8zsh3w';
const STUB_RECIPIENT_PKH = 'aabbccdd00112233445566778899aabbccddaabbccdd001122334455';

const STUB_CONFIG = {
	trpEndpoint: 'http://localhost:50051',
	profile: 'local' as const,
	metadataLabel: 1337,
	merchantAddress: 'addr1test_merchant_bech32',
};

const STUB_WITNESSES = [
	{
		type: 'vkey',
		key: { content: 'aabbcc', contentType: 'hex' as const },
		signature: { content: 'ddeeff', contentType: 'hex' as const },
	},
];

const STUB_ENVELOPE = {
	tx: 'deadbeef01020304',
	hash: 'cafebabe00112233445566778899aabbccddeeff00112233445566778899aa',
};

// Published reference-script UTxO (env-driven, read by getBadgeScriptRefUtxo).
const STUB_SCRIPT_REF_TX = 'bb'.repeat(32);
const STUB_SCRIPT_REF_INDEX = 0;
process.env.BADGE_SCRIPT_REF_TX_HASH = STUB_SCRIPT_REF_TX;
process.env.BADGE_SCRIPT_REF_OUTPUT_INDEX = String(STUB_SCRIPT_REF_INDEX);

// ---------------------------------------------------------------------------
// Shared mock fns — declared before vi.mock()
// ---------------------------------------------------------------------------

const mockMintBadge = vi.fn();
const mockSubmit = vi.fn();
const mockClientConstructor = vi.fn();
const mockSign = vi.fn().mockReturnValue(STUB_WITNESSES);
const mockPublicKeyHex = vi.fn().mockReturnValue(STUB_PUBLIC_KEY_HEX);
const mockGetMerchantSigner = vi.fn().mockReturnValue({
	publicKeyHex: mockPublicKeyHex,
	sign: mockSign,
});
const mockGetNetworkConfig = vi.fn().mockReturnValue(STUB_CONFIG);

// ---------------------------------------------------------------------------
// Mock: signer
// ---------------------------------------------------------------------------

vi.mock('../signer.js', () => ({
	getMerchantSigner: mockGetMerchantSigner,
}));

// ---------------------------------------------------------------------------
// Mock: network config
// ---------------------------------------------------------------------------

vi.mock('../network.js', () => ({
	getNetworkConfig: mockGetNetworkConfig,
}));

// ---------------------------------------------------------------------------
// Mock: codegen Client
// ---------------------------------------------------------------------------

vi.mock('@/lib/tx3/protocol', () => {
	function Client(options: unknown, profile: unknown, parties: unknown) {
		mockClientConstructor(options, profile, parties);
		return {
			mintBadge: mockMintBadge,
			submit: mockSubmit,
		};
	}

	return { Client };
});

// ---------------------------------------------------------------------------
// Import module under test (after mocks are registered)
// ---------------------------------------------------------------------------

const { submitMintBadge } = await import('../badges.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();
	mockGetNetworkConfig.mockReturnValue(STUB_CONFIG);
	mockGetMerchantSigner.mockReturnValue({
		publicKeyHex: mockPublicKeyHex,
		sign: mockSign,
	});
	mockPublicKeyHex.mockReturnValue(STUB_PUBLIC_KEY_HEX);
	mockSign.mockReturnValue(STUB_WITNESSES);
	mockMintBadge.mockResolvedValue(STUB_ENVELOPE);
	mockSubmit.mockResolvedValue({ status: 'accepted' });
});

// ---------------------------------------------------------------------------
// Metadata
//
// The rich CIP-25-style payload is RETURNED (for the off-chain issued_badges
// record + app display); tx3 cannot emit nested CIP-25 maps on chain, so the
// on-chain metadata is just the badge name as a single primitive (≤64 bytes).
// ---------------------------------------------------------------------------

describe('metadata', () => {
	it('returns a 721 payload nested by policy_id then asset_name', async () => {
		const result = await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-123');

		const meta = result.metadata as Record<string, unknown>;
		expect(meta).toHaveProperty('721');
		const cip25 = meta['721'] as Record<string, unknown>;
		expect(cip25).toHaveProperty(BADGE_POLICY_ID);
		const asset = cip25[BADGE_POLICY_ID] as Record<string, unknown>;
		expect(asset).toHaveProperty(STUB_ASSET_NAME);
	});

	it('includes name, image (from IPFS CID), description, kind, order_id, merchant, issued_at in the returned payload', async () => {
		const before = new Date().toISOString();
		const result = await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-metadata-full');
		const after = new Date().toISOString();

		const cip25 = (result.metadata as Record<string, unknown>)['721'] as Record<string, Record<string, unknown>>;
		const badgeData = cip25[BADGE_POLICY_ID][STUB_ASSET_NAME] as Record<string, unknown>;

		expect(badgeData.name).toBe('First Purchase');
		expect(badgeData.image).toBe('ipfs://bafyplaceholder1buyerfirstpurchase');
		expect(badgeData.description).toBe('Awarded for completing your first purchase in this store.');
		expect(badgeData.mediaType).toBe('image/png');
		expect(badgeData.kind).toBe('buyer_first_purchase');
		expect(badgeData.order_id).toBe('order-metadata-full');
		expect(badgeData.merchant).toBe(STUB_CONFIG.merchantAddress);
		expect(typeof badgeData.issued_at).toBe('string');
		expect((badgeData.issued_at as string) >= before).toBe(true);
		expect((badgeData.issued_at as string) <= after).toBe(true);
	});

	it('sends only the badge kind as on-chain metadata (a primitive ≤64 bytes)', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-onchain-meta');

		const args = mockMintBadge.mock.calls[0][0] as Record<string, unknown>;
		const bytes = Buffer.from(args.metadata as string, 'hex');
		expect(bytes.toString('utf8')).toBe('buyer_first_purchase');
		expect(bytes.length).toBeLessThanOrEqual(64);
	});
});

// ---------------------------------------------------------------------------
// Routing — the TRP resolver matches args by their original .tx3 (snake_case)
// names, and mint_badge uses the `Merchant` party, so the merchant address must
// be injected as the Client's 3rd constructor arg.
// ---------------------------------------------------------------------------

describe('routing', () => {
	it('passes recipient_address (bech32) to client.mintBadge', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-routing');

		const args = mockMintBadge.mock.calls[0][0] as Record<string, unknown>;
		expect(args.recipient_address).toBe(STUB_RECIPIENT_ADDRESS);
	});

	it('passes asset_name to client.mintBadge', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-asset');

		const args = mockMintBadge.mock.calls[0][0] as Record<string, unknown>;
		expect(args.asset_name).toBe(STUB_ASSET_NAME);
	});

	it('passes badge_script_ref as the published "<txid>#<index>" wire form', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-script');

		const args = mockMintBadge.mock.calls[0][0] as Record<string, unknown>;
		expect(args.badge_script_ref).toBe(`${STUB_SCRIPT_REF_TX}#${STUB_SCRIPT_REF_INDEX}`);
	});

	it('injects the merchant party as the Client 3rd constructor arg', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-parties');

		const parties = mockClientConstructor.mock.calls[0][2] as Record<string, string>;
		expect(parties).toEqual({ merchant: STUB_CONFIG.merchantAddress });
	});
});

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

describe('signing', () => {
	it('calls getMerchantSigner().sign with the envelope hash', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-sign');

		expect(mockSign).toHaveBeenCalledOnce();
		expect(mockSign).toHaveBeenCalledWith(STUB_ENVELOPE.hash);
	});
});

// ---------------------------------------------------------------------------
// Client.submit
// ---------------------------------------------------------------------------

describe('client.submit', () => {
	it('calls client.submit with the envelope tx and signer witnesses', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-submit');

		expect(mockSubmit).toHaveBeenCalledOnce();
		expect(mockSubmit).toHaveBeenCalledWith({
			tx: { content: STUB_ENVELOPE.tx, contentType: 'hex' },
			witnesses: STUB_WITNESSES,
		});
	});
});

// ---------------------------------------------------------------------------
// Return value
// ---------------------------------------------------------------------------

describe('return value', () => {
	it('returns { assetName, txHash, metadata } with the envelope hash', async () => {
		const result = await submitMintBadge(
			'buyer_first_purchase',
			STUB_RECIPIENT_PKH,
			STUB_RECIPIENT_ADDRESS,
			'order-ret',
		);

		expect(result.assetName).toBe(STUB_ASSET_NAME);
		expect(result.txHash).toBe(STUB_ENVELOPE.hash);
		expect(result.metadata).toBeDefined();
		expect(typeof result.metadata).toBe('object');
	});
});

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

describe('error propagation', () => {
	it('propagates errors from client.mintBadge unchanged', async () => {
		const resolveError = new Error('resolve failed: mintBadge');
		mockMintBadge.mockRejectedValueOnce(resolveError);

		await expect(
			submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-err1'),
		).rejects.toThrow('resolve failed: mintBadge');
	});

	it('propagates errors from client.submit unchanged', async () => {
		const chainError = new Error('ChainUnavailable: connection refused');
		mockSubmit.mockRejectedValueOnce(chainError);

		await expect(
			submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-err2'),
		).rejects.toThrow('ChainUnavailable: connection refused');
	});
});

// ---------------------------------------------------------------------------
// Client construction
// ---------------------------------------------------------------------------

describe('client construction', () => {
	it('constructs Client with the endpoint, profile, and merchant party from network config', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-client');

		expect(mockClientConstructor).toHaveBeenCalledOnce();
		expect(mockClientConstructor).toHaveBeenCalledWith(
			{ endpoint: STUB_CONFIG.trpEndpoint },
			STUB_CONFIG.profile,
			{ merchant: STUB_CONFIG.merchantAddress },
		);
	});
});
