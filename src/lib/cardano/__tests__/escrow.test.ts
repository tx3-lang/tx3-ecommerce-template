/**
 * Tests for src/lib/cardano/escrow.ts
 *
 * Mocks at all external boundaries:
 *   - @/lib/tx3/protocol        — codegen Client (all methods + submit)
 *   - tx3-sdk/signer            — decodeWitnessSet
 *   - ../escrow-policy.js       — getShipDeadlineSeconds, getGracePeriodSeconds
 *   - ../network.js             — getNetworkConfig
 *   - ../signer.js              — getMerchantSigner
 *   - ../../server-fns/escrows  — getEscrowByOrderId
 */

import { decode as cborDecode } from 'cbor-x';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuyerSigner } from '../escrow.js';

// ---------------------------------------------------------------------------
// Shared mock fns — declared before vi.mock() so factories can close over them
// ---------------------------------------------------------------------------

const mockLockEscrowAda = vi.fn();
const mockLockEscrowTokens = vi.fn();
const mockMarkShipped = vi.fn();
const mockReleaseEscrow = vi.fn();
const mockRefundEscrow = vi.fn();
const mockSubmit = vi.fn();
const mockClientConstructor = vi.fn();

// ---------------------------------------------------------------------------
// Mock: codegen Client
// ---------------------------------------------------------------------------

vi.mock('@/lib/tx3/protocol', () => {
	// Named function so `new Client(opts, profile)` works as a constructor call.
	function Client(options: unknown, profile: unknown) {
		mockClientConstructor(options, profile);
		return {
			lockEscrowAda: mockLockEscrowAda,
			lockEscrowTokens: mockLockEscrowTokens,
			markShipped: mockMarkShipped,
			releaseEscrow: mockReleaseEscrow,
			refundEscrow: mockRefundEscrow,
			submit: mockSubmit,
		};
	}

	return { Client };
});

// ---------------------------------------------------------------------------
// Mock: tx3-sdk/signer
// ---------------------------------------------------------------------------

vi.mock('tx3-sdk/signer', () => ({
	decodeWitnessSet: vi.fn().mockReturnValue([]),
}));

// ---------------------------------------------------------------------------
// Mock: escrow-policy
// ---------------------------------------------------------------------------

const STUB_SCRIPT_REF_UTXO = {
	txHash: '292e5ad99fde33d00ba1b5a7dee32270ef42068f792710071f38d385f5ff9d91',
	outputIndex: 1,
};

const mockGetScriptAddress = vi.fn().mockReturnValue('addr_test1scriptaddr');
const mockGetShipDeadlineSeconds = vi.fn().mockReturnValue(2592000);
const mockGetGracePeriodSeconds = vi.fn().mockReturnValue(1209600);
const mockGetScriptRefUtxo = vi.fn().mockReturnValue(STUB_SCRIPT_REF_UTXO);

vi.mock('../escrow-policy.js', () => ({
	getScriptAddress: mockGetScriptAddress,
	getShipDeadlineSeconds: mockGetShipDeadlineSeconds,
	getGracePeriodSeconds: mockGetGracePeriodSeconds,
	getScriptRefUtxo: mockGetScriptRefUtxo,
}));

// ---------------------------------------------------------------------------
// Mock: signer (backend merchant signer)
// ---------------------------------------------------------------------------

const STUB_WITNESSES = [
	{
		type: 'vkey',
		key: { content: 'aabbcc', contentType: 'hex' as const },
		signature: { content: 'ddeeff', contentType: 'hex' as const },
	},
];

const mockSign = vi.fn().mockReturnValue(STUB_WITNESSES);
const mockGetMerchantSigner = vi.fn().mockReturnValue({ sign: mockSign });

vi.mock('../signer.js', () => ({
	getMerchantSigner: mockGetMerchantSigner,
}));

// ---------------------------------------------------------------------------
// Mock: getEscrowByOrderId (server-fns/escrows)
// ---------------------------------------------------------------------------

const STUB_ESCROW: Database.Escrow = {
	id: 'escrow-uuid-1',
	order_id: 'order-test-1',
	script_address: 'addr_test1scriptaddr',
	utxo_tx_hash: 'aabbccdd00112233445566778899aabbccddee00112233445566778899aabbcc',
	utxo_output_index: 0,
	status: 'pending',
	buyer_pkh: 'ccddee00112233445566778899aabbccddeeff001122334455667788',
	merchant_pkh: 'aabbcc001122334455667788990011223344556677889900112233aa',
	paid_at: '1716000000000',
	ship_deadline: '1718592000000',
	grace_period_end: null,
	datum_cbor: 'd87a80',
	shipped_tx_hash: null,
	release_tx_hash: null,
	refund_tx_hash: null,
	created_at: '2024-01-01T00:00:00Z',
	updated_at: '2024-01-01T00:00:00Z',
};

const mockGetEscrowByOrderId = vi.fn().mockResolvedValue(STUB_ESCROW);

vi.mock('@/server-fns/escrows.js', () => ({
	getEscrowByOrderId: mockGetEscrowByOrderId,
}));

// ---------------------------------------------------------------------------
// Mock: network config
// ---------------------------------------------------------------------------

// Valid bech32 enterprise address: header 0x60 + 28-byte PKH
// addr_test1v... (enterprise key testnet)
const STUB_MERCHANT_ADDRESS = 'addr_test1vz4thnxazy3rx392h0xd6yfzxdz24w7vm5gjyv6y42auehg20anta';

const STUB_CONFIG = {
	trpEndpoint: 'http://localhost:50051',
	profile: 'local' as const,
	metadataLabel: 1337,
	merchantAddress: STUB_MERCHANT_ADDRESS,
};

const mockGetNetworkConfig = vi.fn().mockReturnValue(STUB_CONFIG);

vi.mock('../network.js', () => ({
	getNetworkConfig: mockGetNetworkConfig,
}));

// ---------------------------------------------------------------------------
// Stub buyer CIP-30 signer (used for submitLockEscrow tests only)
// ---------------------------------------------------------------------------

// buyer_pkh bytes: 28 bytes = 56 hex chars
const STUB_BUYER_PKH_HEX = 'ccddee00112233445566778899aabbccddeeff001122334455667788';
// A Shelley enterprise address (header 0x60 = testnet enterprise key)
// Structure: [header(1)] + [pkh(28)] = 29 bytes total
const STUB_BUYER_ADDR_HEX = `60${STUB_BUYER_PKH_HEX}`;

const mockGetChangeAddress = vi.fn().mockResolvedValue(STUB_BUYER_ADDR_HEX);
const mockSignTx = vi.fn().mockResolvedValue('a0'); // empty witness set CBOR: a0 = {}

const STUB_BUYER_SIGNER: CardanoWalletAPI = {
	getNetworkId: vi.fn(),
	getUtxos: vi.fn(),
	getBalance: vi.fn(),
	getCollateral: vi.fn(),
	getUsedAddresses: vi.fn(),
	getUnusedAddresses: vi.fn(),
	getChangeAddress: mockGetChangeAddress,
	getRewardAddresses: vi.fn(),
	signTx: mockSignTx,
	signData: vi.fn(),
	submitTx: vi.fn(),
};

// ---------------------------------------------------------------------------
// Stub BuyerSigner (used for submitRefundEscrow tests)
// ---------------------------------------------------------------------------

const STUB_VKEY = 'aabbcc001122334455667788990011223344556677889900112233aabb';
const STUB_SIGNATURE =
	'ddeeff00112233445566778899aabbccddeeff001122334455667788990011223344556677889900112233445566778899aabbccddeeff001122334455667788';

const mockSignTxBodyHash = vi.fn().mockResolvedValue({ vkey: STUB_VKEY, signature: STUB_SIGNATURE });

const STUB_BUYER_HASH_SIGNER: BuyerSigner = {
	signTxBodyHash: mockSignTxBodyHash,
};

// Bech32 form of STUB_BUYER_ADDR_HEX (testnet enterprise), used as the Buyer
// party when calling submitRefundEscrow.
const STUB_BUYER_BECH32 = 'addr_test1vqyqxqzqgxqyqyqgxqyqyqgxqyqyqgxqyqyqgxqyqgxq8zsh3w';

// ---------------------------------------------------------------------------
// Stub return values for protocol calls
// ---------------------------------------------------------------------------

const STUB_ENVELOPE = { tx: 'deadbeef01020304', hash: 'cafebabe00112233' };
const STUB_SUBMIT_RESPONSE = { hash: 'cafebabe00112233' };

// ---------------------------------------------------------------------------
// Import module under test (after mocks are registered)
// ---------------------------------------------------------------------------

const { submitLockEscrow, submitMarkShipped, submitReleaseEscrow, submitRefundEscrow } = await import('../escrow.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();
	mockGetNetworkConfig.mockReturnValue(STUB_CONFIG);
	mockGetScriptAddress.mockReturnValue('addr_test1scriptaddr');
	mockGetShipDeadlineSeconds.mockReturnValue(2592000);
	mockGetGracePeriodSeconds.mockReturnValue(1209600);
	mockLockEscrowAda.mockResolvedValue(STUB_ENVELOPE);
	mockLockEscrowTokens.mockResolvedValue(STUB_ENVELOPE);
	mockMarkShipped.mockResolvedValue(STUB_ENVELOPE);
	mockReleaseEscrow.mockResolvedValue(STUB_ENVELOPE);
	mockRefundEscrow.mockResolvedValue(STUB_ENVELOPE);
	mockSubmit.mockResolvedValue(STUB_SUBMIT_RESPONSE);
	mockGetChangeAddress.mockResolvedValue(STUB_BUYER_ADDR_HEX);
	mockSignTx.mockResolvedValue('a0');
	mockSign.mockReturnValue(STUB_WITNESSES);
	mockGetMerchantSigner.mockReturnValue({ sign: mockSign });
	mockGetEscrowByOrderId.mockResolvedValue(STUB_ESCROW);
	mockSignTxBodyHash.mockResolvedValue({ vkey: STUB_VKEY, signature: STUB_SIGNATURE });
});

// ---------------------------------------------------------------------------
// ADA lock path
// ---------------------------------------------------------------------------

describe('submitLockEscrow — ADA value', () => {
	const ADA_VALUE = { lovelace: 5_000_000n };

	describe('datum construction', () => {
		it('calls lockEscrowAda (not lockEscrowTokens) for an ADA value', async () => {
			await submitLockEscrow('order-ada-1', ADA_VALUE, STUB_BUYER_SIGNER);

			expect(mockLockEscrowAda).toHaveBeenCalledOnce();
			expect(mockLockEscrowTokens).not.toHaveBeenCalled();
		});

		it('passes buyer_pkh as a hex string derived from the CIP-30 change address', async () => {
			await submitLockEscrow('order-ada-pkh', ADA_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			// buyer_pkh must be a 56-hex-char string matching STUB_BUYER_PKH_HEX
			expect(args.buyer_pkh).toBe(STUB_BUYER_PKH_HEX);
		});

		it('passes merchant_pkh as a hex string derived from the merchant address', async () => {
			await submitLockEscrow('order-ada-merchant', ADA_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			expect(typeof args.merchant_pkh).toBe('string');
			expect(args.merchant_pkh as string).toMatch(/^[0-9a-f]{56}$/);
		});

		it('passes order_id as a hex string of the UTF-8 bytes', async () => {
			const orderId = 'order-utf8-test';
			await submitLockEscrow(orderId, ADA_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			expect(args.order_id).toBe(Buffer.from(orderId, 'utf8').toString('hex'));
		});

		it('passes paidAt as current Unix timestamp in milliseconds (within 2s window)', async () => {
			const before = Date.now();
			await submitLockEscrow('order-ts', ADA_VALUE, STUB_BUYER_SIGNER);
			const after = Date.now();

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			expect(typeof args.paid_at).toBe('number');
			expect(args.paid_at as number).toBeGreaterThanOrEqual(before);
			expect(args.paid_at as number).toBeLessThanOrEqual(after);
		});

		it('passes shipDeadline as paidAt + shipDeadlineSeconds * 1000', async () => {
			const shipDeadlineSecs = 2592000;
			mockGetShipDeadlineSeconds.mockReturnValue(shipDeadlineSecs);

			const before = Date.now();
			await submitLockEscrow('order-deadline', ADA_VALUE, STUB_BUYER_SIGNER);
			const after = Date.now();

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			const paidAt = args.paid_at as number;
			const shipDeadline = args.ship_deadline as number;

			expect(shipDeadline).toBeGreaterThanOrEqual(before + shipDeadlineSecs * 1000);
			expect(shipDeadline).toBeLessThanOrEqual(after + shipDeadlineSecs * 1000);
			expect(shipDeadline - paidAt).toBe(shipDeadlineSecs * 1000);
		});

		it('passes the ADA quantity in the args', async () => {
			await submitLockEscrow('order-ada-qty', ADA_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			expect(args.quantity).toBe(Number(ADA_VALUE.lovelace));
		});
	});

	describe('Client construction', () => {
		it('constructs Client with the endpoint and profile from network config', async () => {
			await submitLockEscrow('order-client', ADA_VALUE, STUB_BUYER_SIGNER);

			// Two Client instances: one for the prepare/resolve step, one for submit.
			expect(mockClientConstructor).toHaveBeenCalledTimes(2);
			expect(mockClientConstructor).toHaveBeenCalledWith({ endpoint: STUB_CONFIG.trpEndpoint }, STUB_CONFIG.profile);
		});
	});

	describe('buyer signing', () => {
		it('calls wallet.getChangeAddress() to get the buyer address', async () => {
			await submitLockEscrow('order-addr', ADA_VALUE, STUB_BUYER_SIGNER);

			expect(mockGetChangeAddress).toHaveBeenCalledOnce();
		});

		it('calls wallet.signTx with the resolved envelope tx', async () => {
			await submitLockEscrow('order-sign', ADA_VALUE, STUB_BUYER_SIGNER);

			expect(mockSignTx).toHaveBeenCalledOnce();
			expect(mockSignTx).toHaveBeenCalledWith(STUB_ENVELOPE.tx, true);
		});
	});

	describe('submit', () => {
		it('calls client.submit with the envelope tx content', async () => {
			await submitLockEscrow('order-submit', ADA_VALUE, STUB_BUYER_SIGNER);

			expect(mockSubmit).toHaveBeenCalledOnce();
			const submitArgs = mockSubmit.mock.calls[0][0] as {
				tx: { content: string; contentType: string };
				witnesses: unknown[];
			};
			expect(submitArgs.tx).toEqual({ content: STUB_ENVELOPE.tx, contentType: 'hex' });
		});
	});

	describe('return value', () => {
		it('returns lockTxHash equal to the envelope hash', async () => {
			const result = await submitLockEscrow('order-return', ADA_VALUE, STUB_BUYER_SIGNER);

			expect(result.lockTxHash).toBe(STUB_ENVELOPE.hash);
		});

		it('returns lockOutputIndex as a number', async () => {
			const result = await submitLockEscrow('order-index', ADA_VALUE, STUB_BUYER_SIGNER);

			expect(typeof result.lockOutputIndex).toBe('number');
		});

		it('returns datumCbor as a non-empty hex string', async () => {
			const result = await submitLockEscrow('order-datum', ADA_VALUE, STUB_BUYER_SIGNER);

			expect(typeof result.datumCbor).toBe('string');
			expect(result.datumCbor.length).toBeGreaterThan(0);
			// Must be a valid hex string
			expect(result.datumCbor).toMatch(/^[0-9a-f]+$/);
		});

		it('datumCbor encodes EscrowDatum as CONSTR 0 with None (CONSTR 1) grace_period_end', async () => {
			const result = await submitLockEscrow('order-datum-cbor', ADA_VALUE, STUB_BUYER_SIGNER);

			// The EscrowDatum struct itself is CONSTR 0 = CBOR tag 121 (d879 prefix)
			expect(result.datumCbor.startsWith('d879')).toBe(true);

			// Decode and verify structural elements
			const decoded = cborDecode(Buffer.from(result.datumCbor, 'hex')) as {
				tag: number;
				value: unknown[];
			};
			// Top-level must be tag 121
			expect(decoded.tag).toBe(121);
			// The datum has 6 fields: buyerPkh, merchantPkh, orderId, paidAt, shipDeadline, gracePeriodEnd
			expect(Array.isArray(decoded.value)).toBe(true);
			expect((decoded.value as unknown[]).length).toBe(6);

			// grace_period_end (last field) must be None. Aiken's `Option` orders Some
			// first, so None = Plutus CONSTR 1 = CBOR tag 122 with an empty array.
			const gracePeriodEnd = (decoded.value as { tag: number; value: unknown[] }[])[5];
			expect(gracePeriodEnd.tag).toBe(122);
			expect(gracePeriodEnd.value).toEqual([]);

			// The raw None encoding in hex must be d87a80 (tag 122, empty array)
			const noneHex = 'd87a80';
			expect(result.datumCbor).toContain(noneHex);
		});

		it('returns paidAt as a Unix timestamp in milliseconds (within 2s window)', async () => {
			const before = Date.now();
			const result = await submitLockEscrow('order-paid-at', ADA_VALUE, STUB_BUYER_SIGNER);
			const after = Date.now();

			expect(typeof result.paidAt).toBe('number');
			expect(result.paidAt).toBeGreaterThanOrEqual(before);
			expect(result.paidAt).toBeLessThanOrEqual(after);
		});

		it('returns shipDeadline as paidAt + shipDeadlineSeconds * 1000', async () => {
			const shipDeadlineSecs = 2592000;
			mockGetShipDeadlineSeconds.mockReturnValue(shipDeadlineSecs);

			const result = await submitLockEscrow('order-ship-deadline', ADA_VALUE, STUB_BUYER_SIGNER);

			expect(typeof result.shipDeadline).toBe('number');
			expect(result.shipDeadline - result.paidAt).toBe(shipDeadlineSecs * 1000);
		});

		it('returns buyerPkh as a hex string matching the CIP-30 change address PKH', async () => {
			const result = await submitLockEscrow('order-buyer-pkh', ADA_VALUE, STUB_BUYER_SIGNER);

			expect(typeof result.buyerPkh).toBe('string');
			expect(result.buyerPkh).toBe(STUB_BUYER_PKH_HEX);
		});

		it('returns merchantPkh as a 56-char hex string', async () => {
			const result = await submitLockEscrow('order-merchant-pkh', ADA_VALUE, STUB_BUYER_SIGNER);

			expect(typeof result.merchantPkh).toBe('string');
			// 28 bytes = 56 hex chars
			expect(result.merchantPkh).toMatch(/^[0-9a-f]{56}$/);
		});
	});

	describe('error propagation', () => {
		it('surfaces ChainUnavailable from lockEscrowAda unchanged', async () => {
			const chainError = new Error('ChainUnavailable: connection refused');
			mockLockEscrowAda.mockRejectedValueOnce(chainError);

			await expect(submitLockEscrow('order-err', ADA_VALUE, STUB_BUYER_SIGNER)).rejects.toThrow(
				'ChainUnavailable: connection refused',
			);
		});

		it('surfaces errors from client.submit unchanged', async () => {
			const submitError = new Error('ChainUnavailable: submit failed');
			mockSubmit.mockRejectedValueOnce(submitError);

			await expect(submitLockEscrow('order-submit-err', ADA_VALUE, STUB_BUYER_SIGNER)).rejects.toThrow(
				'ChainUnavailable: submit failed',
			);
		});
	});
});

// ---------------------------------------------------------------------------
// Token lock path
// ---------------------------------------------------------------------------

describe('submitLockEscrow — Token value', () => {
	const TOKEN_VALUE = {
		policyId: 'aabbccddeeff0011223344556677889900aabbccddeeff0011223344',
		assetName: '4d794e4654',
		quantity: 1n,
	};

	describe('routing', () => {
		it('calls lockEscrowTokens (not lockEscrowAda) for a token value', async () => {
			await submitLockEscrow('order-token-1', TOKEN_VALUE, STUB_BUYER_SIGNER);

			expect(mockLockEscrowTokens).toHaveBeenCalledOnce();
			expect(mockLockEscrowAda).not.toHaveBeenCalled();
		});

		it('passes token_policy and asset_name as hex strings (TRP wire format)', async () => {
			await submitLockEscrow('order-token-policy', TOKEN_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowTokens.mock.calls[0][0] as Record<string, unknown>;
			expect(args.token_policy).toBe(TOKEN_VALUE.policyId);
			expect(args.asset_name).toBe(TOKEN_VALUE.assetName);
		});

		it('passes tokenQuantity from the value', async () => {
			await submitLockEscrow('order-token-qty', TOKEN_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowTokens.mock.calls[0][0] as Record<string, unknown>;
			expect(args.token_quantity).toBe(Number(TOKEN_VALUE.quantity));
		});

		it('does NOT pass minAda — tx3 computes it via min_utxo(escrow_output)', async () => {
			await submitLockEscrow('order-token-no-min-ada', TOKEN_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowTokens.mock.calls[0][0] as Record<string, unknown>;
			expect(args.min_ada).toBeUndefined();
		});
	});

	describe('return value', () => {
		it('returns lockTxHash, lockOutputIndex, datumCbor, paidAt, shipDeadline, buyerPkh, merchantPkh', async () => {
			const before = Date.now();
			const result = await submitLockEscrow('order-token-return', TOKEN_VALUE, STUB_BUYER_SIGNER);
			const after = Date.now();

			expect(result.lockTxHash).toBe(STUB_ENVELOPE.hash);
			expect(typeof result.lockOutputIndex).toBe('number');
			expect(result.datumCbor).toMatch(/^[0-9a-f]+$/);
			expect(result.paidAt).toBeGreaterThanOrEqual(before);
			expect(result.paidAt).toBeLessThanOrEqual(after);
			expect(result.shipDeadline - result.paidAt).toBe(2592000 * 1000);
			expect(result.buyerPkh).toBe(STUB_BUYER_PKH_HEX);
			expect(result.merchantPkh).toMatch(/^[0-9a-f]{56}$/);
		});
	});

	describe('error propagation', () => {
		it('surfaces ChainUnavailable from lockEscrowTokens unchanged', async () => {
			const chainError = new Error('ChainUnavailable: tokens resolve failed');
			mockLockEscrowTokens.mockRejectedValueOnce(chainError);

			await expect(submitLockEscrow('order-token-err', TOKEN_VALUE, STUB_BUYER_SIGNER)).rejects.toThrow(
				'ChainUnavailable: tokens resolve failed',
			);
		});
	});
});

// ---------------------------------------------------------------------------
// submitMarkShipped
// ---------------------------------------------------------------------------

describe('submitMarkShipped', () => {
	describe('escrow lookup', () => {
		it('calls getEscrowByOrderId with the provided orderId', async () => {
			await submitMarkShipped('order-ms-1');

			expect(mockGetEscrowByOrderId).toHaveBeenCalledOnce();
			expect(mockGetEscrowByOrderId).toHaveBeenCalledWith('order-ms-1');
		});

		it('throws if getEscrowByOrderId returns null', async () => {
			mockGetEscrowByOrderId.mockResolvedValueOnce(null);

			await expect(submitMarkShipped('order-ms-missing')).rejects.toThrow();
		});
	});

	describe('protocol call arguments', () => {
		it('calls client.markShipped (not other tx methods)', async () => {
			await submitMarkShipped('order-ms-2');

			expect(mockMarkShipped).toHaveBeenCalledOnce();
			expect(mockLockEscrowAda).not.toHaveBeenCalled();
			expect(mockReleaseEscrow).not.toHaveBeenCalled();
			expect(mockRefundEscrow).not.toHaveBeenCalled();
		});

		it('passes escrowUtxo with the utxo_tx_hash and utxo_output_index from the escrow row', async () => {
			await submitMarkShipped('order-ms-3');

			const args = mockMarkShipped.mock.calls[0][0] as Record<string, unknown>;
			expect(args.escrow_utxo).toBe(`${STUB_ESCROW.utxo_tx_hash}#${STUB_ESCROW.utxo_output_index}`);
		});

		it('passes scriptRefUtxo from getScriptRefUtxo()', async () => {
			await submitMarkShipped('order-ms-script-ref');

			const args = mockMarkShipped.mock.calls[0][0] as Record<string, unknown>;
			expect(args.script_ref_utxo).toBe(`${STUB_SCRIPT_REF_UTXO.txHash}#${STUB_SCRIPT_REF_UTXO.outputIndex}`);
		});

		it('passes shippedAt as current Unix timestamp in milliseconds (within 2s window)', async () => {
			const before = Date.now();
			await submitMarkShipped('order-ms-ts');
			const after = Date.now();

			const args = mockMarkShipped.mock.calls[0][0] as Record<string, unknown>;
			expect(typeof args.shipped_at).toBe('number');
			expect(args.shipped_at as number).toBeGreaterThanOrEqual(before);
			expect(args.shipped_at as number).toBeLessThanOrEqual(after);
		});

		it('passes gracePeriodEnd as shippedAt + gracePeriodSeconds * 1000', async () => {
			const gracePeriodSecs = 1209600;
			mockGetGracePeriodSeconds.mockReturnValue(gracePeriodSecs);

			const before = Date.now();
			await submitMarkShipped('order-ms-grace');
			const after = Date.now();

			const args = mockMarkShipped.mock.calls[0][0] as Record<string, unknown>;
			const shippedAt = args.shipped_at as number;
			const gracePeriodEnd = args.grace_period_end as number;

			expect(gracePeriodEnd).toBeGreaterThanOrEqual(before + gracePeriodSecs * 1000);
			expect(gracePeriodEnd).toBeLessThanOrEqual(after + gracePeriodSecs * 1000);
			expect(gracePeriodEnd - shippedAt).toBe(gracePeriodSecs * 1000);
		});
	});

	describe('signing — backend signer', () => {
		it('signs with the merchant backend signer (not the buyer CIP-30 signer)', async () => {
			await submitMarkShipped('order-ms-sign');

			expect(mockGetMerchantSigner).toHaveBeenCalled();
			expect(mockSign).toHaveBeenCalledOnce();
			expect(mockSign).toHaveBeenCalledWith(STUB_ENVELOPE.hash);
			// Buyer wallet signTx must NOT be called
			expect(mockSignTx).not.toHaveBeenCalled();
		});

		it('submits with the witnesses from the merchant signer', async () => {
			await submitMarkShipped('order-ms-witnesses');

			const submitArgs = mockSubmit.mock.calls[0][0] as {
				tx: { content: string; contentType: string };
				witnesses: unknown[];
			};
			expect(submitArgs.witnesses).toEqual(STUB_WITNESSES);
		});
	});

	describe('submit', () => {
		it('calls client.submit with the envelope tx content', async () => {
			await submitMarkShipped('order-ms-submit');

			expect(mockSubmit).toHaveBeenCalledOnce();
			const submitArgs = mockSubmit.mock.calls[0][0] as {
				tx: { content: string; contentType: string };
			};
			expect(submitArgs.tx).toEqual({ content: STUB_ENVELOPE.tx, contentType: 'hex' });
		});
	});

	describe('return value', () => {
		it('returns txHash equal to the envelope hash', async () => {
			const result = await submitMarkShipped('order-ms-return');

			expect(result.txHash).toBe(STUB_ENVELOPE.hash);
		});

		it('returns newUtxoRef with the submitted txHash at outputIndex 0', async () => {
			const result = await submitMarkShipped('order-ms-utxo');

			expect(result.newUtxoRef).toMatchObject({
				txHash: STUB_ENVELOPE.hash,
				outputIndex: 0,
			});
		});

		it('returns newDatumCbor as a non-empty hex string', async () => {
			const result = await submitMarkShipped('order-ms-datum');

			expect(typeof result.newDatumCbor).toBe('string');
			expect(result.newDatumCbor.length).toBeGreaterThan(0);
			expect(result.newDatumCbor).toMatch(/^[0-9a-f]+$/);
		});

		it('returns newDatumCbor encoding gracePeriodEnd as Some(ms) in field index 5', async () => {
			const gracePeriodSecs = 1209600;
			mockGetGracePeriodSeconds.mockReturnValue(gracePeriodSecs);

			const before = Date.now();
			const result = await submitMarkShipped('order-ms-datum-grace');
			const after = Date.now();

			const decoded = cborDecode(Buffer.from(result.newDatumCbor, 'hex')) as {
				tag: number;
				value: unknown[];
			};
			// Top-level must be tag 121 (Plutus CONSTR 0)
			expect(decoded.tag).toBe(121);
			// 6 fields
			expect((decoded.value as unknown[]).length).toBe(6);

			// grace_period_end (last field) must be Some(ms). Aiken's `Option` orders
			// Some first, so Some = Plutus CONSTR 0 = CBOR tag 121 wrapping the ms value.
			const gracePeriodEnd = (decoded.value as { tag: number; value: unknown[] }[])[5];
			expect(gracePeriodEnd.tag).toBe(121);
			expect(Array.isArray(gracePeriodEnd.value)).toBe(true);
			expect((gracePeriodEnd.value as unknown[]).length).toBe(1);

			const gracePeriodEndMs = (gracePeriodEnd.value as number[])[0];
			expect(gracePeriodEndMs).toBeGreaterThanOrEqual(before + gracePeriodSecs * 1000);
			expect(gracePeriodEndMs).toBeLessThanOrEqual(after + gracePeriodSecs * 1000);
		});
	});

	describe('error propagation', () => {
		it('surfaces errors from client.markShipped unchanged', async () => {
			const err = new Error('ChainUnavailable: markShipped failed');
			mockMarkShipped.mockRejectedValueOnce(err);

			await expect(submitMarkShipped('order-ms-err')).rejects.toThrow('ChainUnavailable: markShipped failed');
		});

		it('surfaces errors from client.submit unchanged', async () => {
			const err = new Error('ChainUnavailable: submit failed');
			mockSubmit.mockRejectedValueOnce(err);

			await expect(submitMarkShipped('order-ms-submit-err')).rejects.toThrow('ChainUnavailable: submit failed');
		});
	});
});

// ---------------------------------------------------------------------------
// submitReleaseEscrow
// ---------------------------------------------------------------------------

describe('submitReleaseEscrow', () => {
	describe('escrow lookup', () => {
		it('calls getEscrowByOrderId with the provided orderId', async () => {
			await submitReleaseEscrow('order-rel-1');

			expect(mockGetEscrowByOrderId).toHaveBeenCalledOnce();
			expect(mockGetEscrowByOrderId).toHaveBeenCalledWith('order-rel-1');
		});

		it('throws if getEscrowByOrderId returns null', async () => {
			mockGetEscrowByOrderId.mockResolvedValueOnce(null);

			await expect(submitReleaseEscrow('order-rel-missing')).rejects.toThrow();
		});
	});

	describe('protocol call arguments', () => {
		it('calls client.releaseEscrow (not other tx methods)', async () => {
			await submitReleaseEscrow('order-rel-2');

			expect(mockReleaseEscrow).toHaveBeenCalledOnce();
			expect(mockLockEscrowAda).not.toHaveBeenCalled();
			expect(mockMarkShipped).not.toHaveBeenCalled();
			expect(mockRefundEscrow).not.toHaveBeenCalled();
		});

		it('passes escrowUtxo with the utxo_tx_hash and utxo_output_index from the escrow row', async () => {
			await submitReleaseEscrow('order-rel-3');

			const args = mockReleaseEscrow.mock.calls[0][0] as Record<string, unknown>;
			expect(args.escrow_utxo).toBe(`${STUB_ESCROW.utxo_tx_hash}#${STUB_ESCROW.utxo_output_index}`);
		});

		it('passes scriptRefUtxo from getScriptRefUtxo()', async () => {
			await submitReleaseEscrow('order-rel-script-ref');

			const args = mockReleaseEscrow.mock.calls[0][0] as Record<string, unknown>;
			expect(args.script_ref_utxo).toBe(`${STUB_SCRIPT_REF_UTXO.txHash}#${STUB_SCRIPT_REF_UTXO.outputIndex}`);
		});
	});

	describe('signing — backend signer', () => {
		it('signs with the merchant backend signer', async () => {
			await submitReleaseEscrow('order-rel-sign');

			expect(mockGetMerchantSigner).toHaveBeenCalled();
			expect(mockSign).toHaveBeenCalledOnce();
			expect(mockSign).toHaveBeenCalledWith(STUB_ENVELOPE.hash);
			expect(mockSignTx).not.toHaveBeenCalled();
		});

		it('submits with the witnesses from the merchant signer', async () => {
			await submitReleaseEscrow('order-rel-witnesses');

			const submitArgs = mockSubmit.mock.calls[0][0] as {
				witnesses: unknown[];
			};
			expect(submitArgs.witnesses).toEqual(STUB_WITNESSES);
		});
	});

	describe('return value', () => {
		it('returns { txHash } equal to the envelope hash', async () => {
			const result = await submitReleaseEscrow('order-rel-return');

			expect(result).toEqual({ txHash: STUB_ENVELOPE.hash });
		});
	});

	describe('error propagation', () => {
		it('surfaces errors from client.releaseEscrow unchanged', async () => {
			const err = new Error('ChainUnavailable: releaseEscrow failed');
			mockReleaseEscrow.mockRejectedValueOnce(err);

			await expect(submitReleaseEscrow('order-rel-err')).rejects.toThrow('ChainUnavailable: releaseEscrow failed');
		});
	});
});

// ---------------------------------------------------------------------------
// submitRefundEscrow
// ---------------------------------------------------------------------------

describe('submitRefundEscrow', () => {
	describe('escrow lookup', () => {
		it('calls getEscrowByOrderId with the provided orderId', async () => {
			await submitRefundEscrow('order-ref-1', STUB_BUYER_HASH_SIGNER, STUB_BUYER_BECH32);

			expect(mockGetEscrowByOrderId).toHaveBeenCalledOnce();
			expect(mockGetEscrowByOrderId).toHaveBeenCalledWith('order-ref-1');
		});

		it('throws if getEscrowByOrderId returns null', async () => {
			mockGetEscrowByOrderId.mockResolvedValueOnce(null);

			await expect(
				submitRefundEscrow('order-ref-missing', STUB_BUYER_HASH_SIGNER, STUB_BUYER_BECH32),
			).rejects.toThrow();
		});
	});

	describe('protocol call arguments', () => {
		it('calls client.refundEscrow (not other tx methods)', async () => {
			await submitRefundEscrow('order-ref-2', STUB_BUYER_HASH_SIGNER, STUB_BUYER_BECH32);

			expect(mockRefundEscrow).toHaveBeenCalledOnce();
			expect(mockLockEscrowAda).not.toHaveBeenCalled();
			expect(mockMarkShipped).not.toHaveBeenCalled();
			expect(mockReleaseEscrow).not.toHaveBeenCalled();
		});

		it('passes escrowUtxo with the utxo_tx_hash and utxo_output_index from the escrow row', async () => {
			await submitRefundEscrow('order-ref-3', STUB_BUYER_HASH_SIGNER, STUB_BUYER_BECH32);

			const args = mockRefundEscrow.mock.calls[0][0] as Record<string, unknown>;
			expect(args.escrow_utxo).toBe(`${STUB_ESCROW.utxo_tx_hash}#${STUB_ESCROW.utxo_output_index}`);
		});

		it('passes scriptRefUtxo from getScriptRefUtxo()', async () => {
			await submitRefundEscrow('order-ref-script-ref', STUB_BUYER_HASH_SIGNER, STUB_BUYER_BECH32);

			const args = mockRefundEscrow.mock.calls[0][0] as Record<string, unknown>;
			expect(args.script_ref_utxo).toBe(`${STUB_SCRIPT_REF_UTXO.txHash}#${STUB_SCRIPT_REF_UTXO.outputIndex}`);
		});
	});

	describe('signing — buyer hash signer', () => {
		it('signs the tx body hash with the buyer hash signer (not CIP-30 signTx, not merchant signer)', async () => {
			await submitRefundEscrow('order-ref-sign', STUB_BUYER_HASH_SIGNER, STUB_BUYER_BECH32);

			// signTxBodyHash must be called with the envelope hash
			expect(mockSignTxBodyHash).toHaveBeenCalledOnce();
			expect(mockSignTxBodyHash).toHaveBeenCalledWith(STUB_ENVELOPE.hash);
			// CIP-30 signTx must NOT be called
			expect(mockSignTx).not.toHaveBeenCalled();
			// Backend merchant signer must NOT be called
			expect(mockSign).not.toHaveBeenCalled();
		});

		it('does NOT call getChangeAddress (refund just signs the hash)', async () => {
			// refundEscrow doesn't need to derive buyer PKH — it just signs the hash
			await submitRefundEscrow('order-ref-no-addr', STUB_BUYER_HASH_SIGNER, STUB_BUYER_BECH32);

			// CIP-30 getChangeAddress must NOT be called
			expect(mockGetChangeAddress).not.toHaveBeenCalled();
		});

		it('submits with a vkey witness built from the signer output', async () => {
			await submitRefundEscrow('order-ref-witnesses', STUB_BUYER_HASH_SIGNER, STUB_BUYER_BECH32);

			expect(mockSubmit).toHaveBeenCalledOnce();
			const submitArgs = mockSubmit.mock.calls[0][0] as {
				witnesses: {
					type: string;
					key: { content: string; contentType: string };
					signature: { content: string; contentType: string };
				}[];
			};
			expect(submitArgs.witnesses).toHaveLength(1);
			expect(submitArgs.witnesses[0]).toMatchObject({
				type: 'vkey',
				key: { content: STUB_VKEY, contentType: 'hex' },
				signature: { content: STUB_SIGNATURE, contentType: 'hex' },
			});
		});
	});

	describe('return value', () => {
		it('returns { txHash } equal to the envelope hash', async () => {
			const result = await submitRefundEscrow('order-ref-return', STUB_BUYER_HASH_SIGNER, STUB_BUYER_BECH32);

			expect(result).toEqual({ txHash: STUB_ENVELOPE.hash });
		});
	});

	describe('error propagation', () => {
		it('surfaces errors from client.refundEscrow unchanged', async () => {
			const err = new Error('ChainUnavailable: refundEscrow failed');
			mockRefundEscrow.mockRejectedValueOnce(err);

			await expect(
				submitRefundEscrow('order-ref-err', STUB_BUYER_HASH_SIGNER, STUB_BUYER_BECH32),
			).rejects.toThrow('ChainUnavailable: refundEscrow failed');
		});
	});
});
