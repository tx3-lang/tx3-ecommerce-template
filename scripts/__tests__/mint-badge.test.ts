/**
 * Tests for scripts/mint-badge.ts
 *
 * Tests the `main(args)` function extracted from the CLI entry point.
 *
 * All external boundaries are mocked:
 *   - @supabase/supabase-js         — Supabase client
 *   - @/lib/cardano/badges          — submitMintBadge
 *   - @/lib/cardano/badges-catalog  — getCatalogEntry + eligibility
 *   - @/lib/cardano/badges-policy   — getPolicyId
 *   - @/lib/cardano/network         — getNetworkConfig (controls explorer URL)
 *   - @/server-fns/issued-badges    — insertIssuedBadge
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Set up env vars needed by the script (real modules used in implementation)
// ---------------------------------------------------------------------------
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'service-role-secret';
process.env.MERCHANT_ADDRESS = 'addr1qtest_merchant_address';
process.env.CARDANO_MERCHANT_SKEY =
	'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// ---------------------------------------------------------------------------
// Shared Supabase mock fns
// The script does:
//   supabase.from('orders').select('wallet_address').eq('id', orderId).single()
//   supabase.from('escrows').select('status,buyer_pkh,merchant_pkh').eq('order_id', orderId).single()
//   supabase.from('issued_badges').select('mint_tx_hash').eq('kind', kind).eq('recipient_pkh', pkh).maybeSingle()
// ---------------------------------------------------------------------------

// Orders chain
const mockOrdersSingle = vi.fn();
const mockOrdersEq = vi.fn(() => ({ single: mockOrdersSingle }));
const mockOrdersSelect = vi.fn(() => ({ eq: mockOrdersEq }));

// Escrows chain
const mockEscrowsSingle = vi.fn();
const mockEscrowsEq = vi.fn(() => ({ single: mockEscrowsSingle }));
const mockEscrowsSelect = vi.fn(() => ({ eq: mockEscrowsEq }));

// Issued badges chain
const mockIssuedBadgesMaybeSingle = vi.fn();
const mockIssuedBadgesEq2 = vi.fn(() => ({ maybeSingle: mockIssuedBadgesMaybeSingle }));
const mockIssuedBadgesEq1 = vi.fn(() => ({ eq: mockIssuedBadgesEq2 }));
const mockIssuedBadgesSelect = vi.fn(() => ({ eq: mockIssuedBadgesEq1 }));

const mockFrom = vi.fn((table: string) => {
	switch (table) {
		case 'orders':
			return { select: mockOrdersSelect };
		case 'escrows':
			return { select: mockEscrowsSelect };
		case 'issued_badges':
			return { select: mockIssuedBadgesSelect };
		default:
			return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })) };
	}
});

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({ from: mockFrom })),
}));

// ---------------------------------------------------------------------------
// Mock: submitMintBadge
// ---------------------------------------------------------------------------
const mockSubmitMintBadge = vi.fn();

vi.mock('@/lib/cardano/badges', () => ({
	submitMintBadge: mockSubmitMintBadge,
}));

// ---------------------------------------------------------------------------
// Mock: badges-catalog
// ---------------------------------------------------------------------------
const mockEligibility = vi.fn();
const mockGetCatalogEntry = vi.fn();

vi.mock('@/lib/cardano/badges-catalog', () => ({
	getCatalogEntry: mockGetCatalogEntry,
	BADGES_CATALOG: {},
}));

// ---------------------------------------------------------------------------
// Mock: badges-policy
// ---------------------------------------------------------------------------
const mockGetPolicyId = vi.fn();

vi.mock('@/lib/cardano/badges-policy', () => ({
	getPolicyId: mockGetPolicyId,
}));

// ---------------------------------------------------------------------------
// Mock: network
// ---------------------------------------------------------------------------
const mockGetNetworkConfig = vi.fn();

vi.mock('@/lib/cardano/network', () => ({
	getNetworkConfig: mockGetNetworkConfig,
}));

// ---------------------------------------------------------------------------
// Mock: issued-badges
// ---------------------------------------------------------------------------
const mockInsertIssuedBadge = vi.fn();

vi.mock('@/server-fns/issued-badges', () => ({
	insertIssuedBadge: mockInsertIssuedBadge,
}));

// ---------------------------------------------------------------------------
// Import module under test (AFTER mocks are registered — vi.mock is hoisted)
// ---------------------------------------------------------------------------
const { main } = await import('../mint-badge.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BUYER_PKH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const MERCHANT_PKH = 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6';
const WALLET_ADDRESS = 'addr1qbuyer_wallet_address';
const MERCHANT_ADDRESS = 'addr1qtest_merchant_address';
const TX_HASH =
	'cafebabe00112233deadbeef445566778899aabbccddeeff00112233445566778899';
const ASSET_NAME =
	'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const POLICY_ID = 'bad1ebabe0000000000000000000000000000000000000000000000000dead';
const BADGE_KIND_CLI = 'buyer-first-purchase';
const BADGE_KIND = 'buyer_first_purchase' as Database.BadgeKind;
const EXISTING_TX_HASH =
	'deadbeef00112233deadbeef445566778899aabbccddeeff00112233445566778899';

const MINT_RESULT = {
	assetName: ASSET_NAME,
	txHash: TX_HASH,
	metadata: { '721': { [POLICY_ID]: { [ASSET_NAME]: { name: 'First Purchase' } } } },
};

const SAMPLE_ISSUED_BADGE: Database.IssuedBadge = {
	id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	kind: BADGE_KIND,
	recipient_pkh: BUYER_PKH,
	recipient_address: WALLET_ADDRESS,
	triggering_order_id: ORDER_ID,
	policy_id: POLICY_ID,
	asset_name_hex: ASSET_NAME,
	mint_tx_hash: TX_HASH,
	metadata: {},
	minted_at: '2026-05-22T00:00:00Z',
};

const STUB_NETWORK_PREVIEW = {
	trpEndpoint: 'https://preview.trp.example.com',
	profile: 'preview' as const,
	metadataLabel: 1337,
	merchantAddress: MERCHANT_ADDRESS,
};

const STUB_NETWORK_LOCAL = {
	...STUB_NETWORK_PREVIEW,
	profile: 'local' as const,
};

const CATALOG_ENTRY_BUYER = {
	kind_id: 1,
	name: 'First Purchase',
	description: 'Awarded for completing your first purchase.',
	ipfs_image_cid: 'ipfs://bafytest',
	recipient_role: 'buyer' as const,
	eligibility: mockEligibility,
};

const CATALOG_ENTRY_MERCHANT = {
	kind_id: 2,
	name: 'First Delivery',
	description: 'Awarded for completing your first delivery as a merchant.',
	ipfs_image_cid: 'ipfs://bafytest2',
	recipient_role: 'merchant' as const,
	eligibility: mockEligibility,
};

beforeEach(() => {
	vi.clearAllMocks();

	// Default happy-path stubs
	mockGetNetworkConfig.mockReturnValue(STUB_NETWORK_PREVIEW);
	mockSubmitMintBadge.mockResolvedValue(MINT_RESULT);
	mockInsertIssuedBadge.mockResolvedValue(SAMPLE_ISSUED_BADGE);
	mockGetPolicyId.mockReturnValue(POLICY_ID);
	mockEligibility.mockResolvedValue(true);
	mockGetCatalogEntry.mockReturnValue(CATALOG_ENTRY_BUYER);

	// Default: order exists with wallet_address
	mockOrdersSingle.mockResolvedValue({
		data: { wallet_address: WALLET_ADDRESS },
		error: null,
	});
	// Default: escrow is released
	mockEscrowsSingle.mockResolvedValue({
		data: { status: 'released', buyer_pkh: BUYER_PKH, merchant_pkh: MERCHANT_PKH },
		error: null,
	});
	// Default: no existing badge
	mockIssuedBadgesMaybeSingle.mockResolvedValue({ data: null, error: null });
});

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
describe('arg parsing', () => {
	it('rejects missing --order-id', async () => {
		await expect(main(['--kind', BADGE_KIND_CLI])).rejects.toThrow('MISSING_ARG');
	});

	it('rejects missing --kind', async () => {
		await expect(main(['--order-id', ORDER_ID])).rejects.toThrow('MISSING_ARG');
	});

	it('rejects invalid --kind value', async () => {
		await expect(
			main(['--order-id', ORDER_ID, '--kind', 'invalid-kind']),
		).rejects.toThrow('INVALID_KIND');
	});

	it('accepts valid args "buyer-first-purchase"', async () => {
		await expect(
			main(['--order-id', ORDER_ID, '--kind', 'buyer-first-purchase']),
		).resolves.not.toThrow();
	});

	it('accepts valid args "seller-first-delivery"', async () => {
		mockGetCatalogEntry.mockReturnValue(CATALOG_ENTRY_MERCHANT);
		await expect(
			main(['--order-id', ORDER_ID, '--kind', 'seller-first-delivery']),
		).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Order/escrw loading
// ---------------------------------------------------------------------------
describe('order and escrow loading', () => {
	it('throws ORDER_NOT_FOUND when the order does not exist', async () => {
		mockOrdersSingle.mockResolvedValueOnce({
			data: null,
			error: { message: 'not found', code: 'PGRST116' },
		});

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow('ORDER_NOT_FOUND');
	});

	it('throws ORDER_NOT_FOUND when the escrow does not exist', async () => {
		mockEscrowsSingle.mockResolvedValueOnce({
			data: null,
			error: { message: 'not found', code: 'PGRST116' },
		});

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow('ORDER_NOT_FOUND');
	});
});

// ---------------------------------------------------------------------------
// Escrow status
// ---------------------------------------------------------------------------
describe('escrow status', () => {
	it('aborts with ORDER_NOT_ELIGIBLE when escrow status is "pending"', async () => {
		mockEscrowsSingle.mockResolvedValueOnce({
			data: { status: 'pending', buyer_pkh: BUYER_PKH, merchant_pkh: MERCHANT_PKH },
			error: null,
		});

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow('ORDER_NOT_ELIGIBLE');
	});

	it('aborts with ORDER_NOT_ELIGIBLE when escrow status is "shipped"', async () => {
		mockEscrowsSingle.mockResolvedValueOnce({
			data: { status: 'shipped', buyer_pkh: BUYER_PKH, merchant_pkh: MERCHANT_PKH },
			error: null,
		});

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow('ORDER_NOT_ELIGIBLE');
	});

	it('aborts with ORDER_NOT_ELIGIBLE when escrow status is "refunded"', async () => {
		mockEscrowsSingle.mockResolvedValueOnce({
			data: { status: 'refunded', buyer_pkh: BUYER_PKH, merchant_pkh: MERCHANT_PKH },
			error: null,
		});

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow('ORDER_NOT_ELIGIBLE');
	});

	it('proceeds when escrow status is "released"', async () => {
		mockEscrowsSingle.mockResolvedValueOnce({
			data: { status: 'released', buyer_pkh: BUYER_PKH, merchant_pkh: MERCHANT_PKH },
			error: null,
		});

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------
describe('recipient resolution', () => {
	it('resolves buyer recipient from order.wallet_address and escrow.buyer_pkh', async () => {
		await main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]);

		expect(mockSubmitMintBadge).toHaveBeenCalledWith(
			BADGE_KIND,
			BUYER_PKH,
			WALLET_ADDRESS,
			ORDER_ID,
		);
	});

	it('resolves merchant recipient from env MERCHANT_ADDRESS and escrow.merchant_pkh', async () => {
		mockGetCatalogEntry.mockReturnValue(CATALOG_ENTRY_MERCHANT);

		await main(['--order-id', ORDER_ID, '--kind', 'seller-first-delivery']);

		expect(mockSubmitMintBadge).toHaveBeenCalledWith(
			'seller_first_delivery',
			MERCHANT_PKH,
			MERCHANT_ADDRESS,
			ORDER_ID,
		);
	});
});

// ---------------------------------------------------------------------------
// Eligibility check
// ---------------------------------------------------------------------------
describe('eligibility check', () => {
	it('calls catalog eligibility function with orderId and dbClient', async () => {
		await main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]);

		expect(mockEligibility).toHaveBeenCalledOnce();
		expect(mockEligibility).toHaveBeenCalledWith(ORDER_ID, expect.anything());
	});

	it('aborts with ELIGIBILITY_NOT_MET when eligibility returns false', async () => {
		mockEligibility.mockResolvedValueOnce(false);

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow('ELIGIBILITY_NOT_MET');
	});

	it('does NOT call submitMintBadge when eligibility is not met', async () => {
		mockEligibility.mockResolvedValueOnce(false);

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow();

		expect(mockSubmitMintBadge).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Already issued check
// ---------------------------------------------------------------------------
describe('already issued check', () => {
	it('aborts with BADGE_ALREADY_ISSUED when a badge already exists for the recipient', async () => {
		mockIssuedBadgesMaybeSingle.mockResolvedValueOnce({
			data: { mint_tx_hash: EXISTING_TX_HASH },
			error: null,
		});

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow(`BADGE_ALREADY_ISSUED`);
	});

	it('includes the existing mint_tx_hash in the error message', async () => {
		mockIssuedBadgesMaybeSingle.mockResolvedValueOnce({
			data: { mint_tx_hash: EXISTING_TX_HASH },
			error: null,
		});

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow(EXISTING_TX_HASH);
	});

	it('proceeds when no existing badge is found', async () => {
		mockIssuedBadgesMaybeSingle.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Happy path — mint + persist
// ---------------------------------------------------------------------------
describe('happy path', () => {
	it('calls submitMintBadge with correct arguments', async () => {
		await main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]);

		expect(mockSubmitMintBadge).toHaveBeenCalledOnce();
		expect(mockSubmitMintBadge).toHaveBeenCalledWith(
			BADGE_KIND,
			BUYER_PKH,
			WALLET_ADDRESS,
			ORDER_ID,
		);
	});

	it('inserts an issued_badges row after successful mint', async () => {
		await main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]);

		expect(mockInsertIssuedBadge).toHaveBeenCalledOnce();
		expect(mockInsertIssuedBadge).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: BADGE_KIND,
				recipient_pkh: BUYER_PKH,
				recipient_address: WALLET_ADDRESS,
				triggering_order_id: ORDER_ID,
				policy_id: POLICY_ID,
				asset_name_hex: ASSET_NAME,
				mint_tx_hash: TX_HASH,
				metadata: MINT_RESULT.metadata,
			}),
		);
	});

	it('loads the order wallet_address from DB', async () => {
		await main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]);

		expect(mockOrdersSelect).toHaveBeenCalledWith('wallet_address');
		expect(mockOrdersEq).toHaveBeenCalledWith('id', ORDER_ID);
	});
});

// ---------------------------------------------------------------------------
// Rollback on mint failure
// ---------------------------------------------------------------------------
describe('rollback on mint failure', () => {
	it('does NOT call insertIssuedBadge when submitMintBadge throws', async () => {
		mockSubmitMintBadge.mockRejectedValueOnce(new Error('ChainUnavailable'));

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow('ChainUnavailable');

		expect(mockInsertIssuedBadge).not.toHaveBeenCalled();
	});

	it('propagates the chain error', async () => {
		mockSubmitMintBadge.mockRejectedValueOnce(new Error('TxRejected: utxo not found'));

		await expect(
			main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]),
		).rejects.toThrow('TxRejected');
	});
});

// ---------------------------------------------------------------------------
// Output / explorer URL
// ---------------------------------------------------------------------------
describe('output', () => {
	it('returns the txHash from the mint result', async () => {
		const result = await main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]);

		expect(result.txHash).toBe(TX_HASH);
	});

	it('includes a preview.cexplorer.io explorer URL when profile is "preview"', async () => {
		mockGetNetworkConfig.mockReturnValue(STUB_NETWORK_PREVIEW);

		const result = await main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]);

		expect(result.explorerUrl).toBe(`https://preview.cexplorer.io/tx/${TX_HASH}`);
	});

	it('does NOT include an explorer URL when profile is "local"', async () => {
		mockGetNetworkConfig.mockReturnValue(STUB_NETWORK_LOCAL);

		const result = await main(['--order-id', ORDER_ID, '--kind', BADGE_KIND_CLI]);

		expect(result.explorerUrl).toBeUndefined();
	});
});
