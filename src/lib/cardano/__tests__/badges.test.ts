/**
 * Tests for src/lib/cardano/badges.ts
 *
 * Mocks at all external boundaries:
 *   - @/lib/tx3/protocol        — codegen Client (mintBadge + submit)
 *   - ../network.js             — getNetworkConfig
 *   - ../signer.js              — getMerchantSigner
 *   - @noble/hashes/blake2.js   — blake2b for pkh derivation
 */

import { Buffer } from 'buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Stub constants
// ---------------------------------------------------------------------------

const STUB_MERCHANT_PKH = '00112233445566778899aabbccddeeff00112233445566778899';
const STUB_PUBLIC_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const STUB_ASSET_NAME = '0001aabbccdd00112233445566778899aabbccddaabbccdd001122334455';
const STUB_RECIPIENT_ADDRESS = 'addr1test_recipient_address';
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
// Mock: @noble/hashes/blake2.js
// ---------------------------------------------------------------------------

const MOCK_BLAKE2B_HASH = Buffer.from(STUB_MERCHANT_PKH, 'hex');
const mockBlake2b = vi.fn().mockReturnValue(MOCK_BLAKE2B_HASH);

vi.mock('@noble/hashes/blake2.js', () => ({
	blake2b: mockBlake2b,
}));

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
	function Client(options: unknown, profile: unknown) {
		mockClientConstructor(options, profile);
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
	mockBlake2b.mockReturnValue(MOCK_BLAKE2B_HASH);
	mockMintBadge.mockResolvedValue(STUB_ENVELOPE);
	mockSubmit.mockResolvedValue({ status: 'accepted' });
});

// ---------------------------------------------------------------------------
// Helper to decode metadata from mintBadge call
// ---------------------------------------------------------------------------

function decodeMetadataFromMock(): Record<string, unknown> {
	const args = mockMintBadge.mock.calls[0][0] as Record<string, unknown>;
	const metadataHex = args.metadata as string;
	return JSON.parse(Buffer.from(metadataHex, 'hex').toString('utf8'));
}

// ---------------------------------------------------------------------------
// CIP-25 metadata shape
// ---------------------------------------------------------------------------

describe('CIP-25 metadata', () => {
	it('builds metadata with the 721 label as top-level key', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-123');

		const metadata = decodeMetadataFromMock();
		expect(metadata).toHaveProperty('721');
	});

	it('nests the asset under the policy_id hex', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-123');

		const metadata = decodeMetadataFromMock();
		const cip25 = metadata['721'] as Record<string, unknown>;
		expect(cip25).toHaveProperty(STUB_MERCHANT_PKH);
	});

	it('nests the asset metadata under the asset_name_hex', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-123');

		const metadata = decodeMetadataFromMock();
		const cip25 = metadata['721'] as Record<string, unknown>;
		const asset = cip25[STUB_MERCHANT_PKH] as Record<string, unknown>;
		expect(asset).toHaveProperty(STUB_ASSET_NAME);
	});

	it('includes name, image (from IPFS CID), description, kind, order_id, merchant, issued_at in asset metadata', async () => {
		const before = new Date().toISOString();
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-metadata-full');

		const metadata = decodeMetadataFromMock();
		const cip25 = metadata['721'] as Record<string, unknown>;
		const asset = cip25[STUB_MERCHANT_PKH] as Record<string, Record<string, unknown>>;
		const badgeData = asset[STUB_ASSET_NAME] as Record<string, unknown>;

		expect(badgeData.name).toBe('First Purchase');
		expect(badgeData.image).toBe('ipfs://bafyplaceholder1buyerfirstpurchase');
		expect(badgeData.description).toBe('Awarded for completing your first purchase in this store.');
		expect(badgeData.mediaType).toBe('image/png');
		expect(badgeData.kind).toBe('buyer_first_purchase');
		expect(badgeData.order_id).toBe('order-metadata-full');
		expect(badgeData.merchant).toBe(STUB_CONFIG.merchantAddress);
		expect(typeof badgeData.issued_at).toBe('string');
		const after = new Date().toISOString();
		expect((badgeData.issued_at as string) >= before).toBe(true);
		expect((badgeData.issued_at as string) <= after).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

describe('routing', () => {
	it('passes recipientAddress to client.mintBadge', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-routing');

		const args = mockMintBadge.mock.calls[0][0] as Record<string, unknown>;
		expect(args.recipientAddress).toBe(STUB_RECIPIENT_ADDRESS);
	});

	it('passes policy_id to client.mintBadge', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-policy');

		const args = mockMintBadge.mock.calls[0][0] as Record<string, unknown>;
		expect(args.policyId).toBe(STUB_MERCHANT_PKH);
	});

	it('passes asset_name to client.mintBadge', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-asset');

		const args = mockMintBadge.mock.calls[0][0] as Record<string, unknown>;
		expect(args.assetName).toBe(STUB_ASSET_NAME);
	});

	it('passes applied_script_cbor to client.mintBadge', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-script');

		const args = mockMintBadge.mock.calls[0][0] as Record<string, unknown>;
		expect(typeof args.appliedScriptCbor).toBe('string');
		expect((args.appliedScriptCbor as string).length).toBeGreaterThan(0);
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
	it('constructs Client with the endpoint and profile from network config', async () => {
		await submitMintBadge('buyer_first_purchase', STUB_RECIPIENT_PKH, STUB_RECIPIENT_ADDRESS, 'order-client');

		expect(mockClientConstructor).toHaveBeenCalledOnce();
		expect(mockClientConstructor).toHaveBeenCalledWith({ endpoint: STUB_CONFIG.trpEndpoint }, STUB_CONFIG.profile);
	});
});
