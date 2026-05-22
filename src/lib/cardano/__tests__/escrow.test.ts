/**
 * Tests for src/lib/cardano/escrow.ts
 *
 * Mocks at all external boundaries:
 *   - @/lib/tx3/protocol  — codegen Client (lockEscrowAda + lockEscrowTokens + submit)
 *   - ../escrow-policy.js — getScriptAddress + getShipDeadlineSeconds
 *   - ../network.js       — getNetworkConfig
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock fns — declared before vi.mock() so factories can close over them
// ---------------------------------------------------------------------------

const mockLockEscrowAda = vi.fn();
const mockLockEscrowTokens = vi.fn();
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
			submit: mockSubmit,
		};
	}

	return { Client };
});

// ---------------------------------------------------------------------------
// Mock: escrow-policy
// ---------------------------------------------------------------------------

const mockGetScriptAddress = vi.fn().mockReturnValue('addr_test1scriptaddr');
const mockGetShipDeadlineSeconds = vi.fn().mockReturnValue(2592000);

vi.mock('../escrow-policy.js', () => ({
	getScriptAddress: mockGetScriptAddress,
	getShipDeadlineSeconds: mockGetShipDeadlineSeconds,
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
// Stub buyer CIP-30 signer
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
// Stub return values for protocol calls
// ---------------------------------------------------------------------------

const STUB_ENVELOPE = { tx: 'deadbeef01020304', hash: 'cafebabe00112233' };
const STUB_SUBMIT_RESPONSE = { hash: 'cafebabe00112233' };

// ---------------------------------------------------------------------------
// Import module under test (after mocks are registered)
// ---------------------------------------------------------------------------

const { submitLockEscrow } = await import('../escrow.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();
	mockGetNetworkConfig.mockReturnValue(STUB_CONFIG);
	mockGetScriptAddress.mockReturnValue('addr_test1scriptaddr');
	mockGetShipDeadlineSeconds.mockReturnValue(2592000);
	mockLockEscrowAda.mockResolvedValue(STUB_ENVELOPE);
	mockLockEscrowTokens.mockResolvedValue(STUB_ENVELOPE);
	mockSubmit.mockResolvedValue(STUB_SUBMIT_RESPONSE);
	mockGetChangeAddress.mockResolvedValue(STUB_BUYER_ADDR_HEX);
	mockSignTx.mockResolvedValue('a0');
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

		it('passes buyerPkh derived from the CIP-30 change address', async () => {
			await submitLockEscrow('order-ada-pkh', ADA_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			// buyerPkh must be a Buffer/Uint8Array of 28 bytes matching STUB_BUYER_PKH_HEX
			expect(args.buyerPkh).toBeInstanceOf(Buffer);
			expect((args.buyerPkh as Buffer).toString('hex')).toBe(STUB_BUYER_PKH_HEX);
		});

		it('passes merchantPkh derived from the merchant address in network config', async () => {
			await submitLockEscrow('order-ada-merchant', ADA_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			expect(args.merchantPkh).toBeInstanceOf(Buffer);
		});

		it('passes orderId as bytes (UTF-8 encoded)', async () => {
			const orderId = 'order-utf8-test';
			await submitLockEscrow(orderId, ADA_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			expect(args.orderId).toBeInstanceOf(Buffer);
			expect((args.orderId as Buffer).toString('utf8')).toBe(orderId);
		});

		it('passes paidAt as current Unix timestamp in milliseconds (within 2s window)', async () => {
			const before = Date.now();
			await submitLockEscrow('order-ts', ADA_VALUE, STUB_BUYER_SIGNER);
			const after = Date.now();

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			expect(typeof args.paidAt).toBe('number');
			expect(args.paidAt as number).toBeGreaterThanOrEqual(before);
			expect(args.paidAt as number).toBeLessThanOrEqual(after);
		});

		it('passes shipDeadline as paidAt + shipDeadlineSeconds * 1000', async () => {
			const shipDeadlineSecs = 2592000;
			mockGetShipDeadlineSeconds.mockReturnValue(shipDeadlineSecs);

			const before = Date.now();
			await submitLockEscrow('order-deadline', ADA_VALUE, STUB_BUYER_SIGNER);
			const after = Date.now();

			const args = mockLockEscrowAda.mock.calls[0][0] as Record<string, unknown>;
			const paidAt = args.paidAt as number;
			const shipDeadline = args.shipDeadline as number;

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

			expect(mockClientConstructor).toHaveBeenCalledOnce();
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
		lovelace: 2_000_000n,
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

		it('passes tokenPolicy and assetName as Buffers', async () => {
			await submitLockEscrow('order-token-policy', TOKEN_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowTokens.mock.calls[0][0] as Record<string, unknown>;
			expect(args.tokenPolicy).toBeInstanceOf(Buffer);
			expect((args.tokenPolicy as Buffer).toString('hex')).toBe(TOKEN_VALUE.policyId);
			expect(args.assetName).toBeInstanceOf(Buffer);
			expect((args.assetName as Buffer).toString('hex')).toBe(TOKEN_VALUE.assetName);
		});

		it('passes tokenQuantity from the value', async () => {
			await submitLockEscrow('order-token-qty', TOKEN_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowTokens.mock.calls[0][0] as Record<string, unknown>;
			expect(args.tokenQuantity).toBe(Number(TOKEN_VALUE.quantity));
		});

		it('passes minAda from the lovelace field', async () => {
			await submitLockEscrow('order-token-ada', TOKEN_VALUE, STUB_BUYER_SIGNER);

			const args = mockLockEscrowTokens.mock.calls[0][0] as Record<string, unknown>;
			expect(args.minAda).toBe(Number(TOKEN_VALUE.lovelace));
		});
	});

	describe('return value', () => {
		it('returns lockTxHash, lockOutputIndex, datumCbor', async () => {
			const result = await submitLockEscrow('order-token-return', TOKEN_VALUE, STUB_BUYER_SIGNER);

			expect(result.lockTxHash).toBe(STUB_ENVELOPE.hash);
			expect(typeof result.lockOutputIndex).toBe('number');
			expect(result.datumCbor).toMatch(/^[0-9a-f]+$/);
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
