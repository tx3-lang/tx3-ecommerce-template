import { describe, expect, it } from 'vitest';
import { deriveAssetName } from '../badges-asset-name.js';

const BUYER_PKH = 'aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd';
const SELLER_PKH = '11223344112233441122334411223344112233441122334411223344';

describe('deriveAssetName', () => {
	it('returns exactly 60 hex characters (30 bytes)', () => {
		const result = deriveAssetName('buyer_first_purchase', BUYER_PKH);
		expect(result).toHaveLength(60);
		expect(/^[0-9a-f]{60}$/.test(result)).toBe(true);
	});

	it('first 4 hex chars are 0001 for buyer_first_purchase', () => {
		const result = deriveAssetName('buyer_first_purchase', BUYER_PKH);
		expect(result.substring(0, 4)).toBe('0001');
	});

	it('first 4 hex chars are 0002 for seller_first_delivery', () => {
		const result = deriveAssetName('seller_first_delivery', SELLER_PKH);
		expect(result.substring(0, 4)).toBe('0002');
	});

	it('remaining 56 hex chars equal the recipient_pkh', () => {
		const result = deriveAssetName('buyer_first_purchase', BUYER_PKH);
		expect(result.substring(4)).toBe(BUYER_PKH.toLowerCase());
	});

	it('different kind produces different asset_name for same recipient', () => {
		const buyer = deriveAssetName('buyer_first_purchase', BUYER_PKH);
		const seller = deriveAssetName('seller_first_delivery', BUYER_PKH);
		expect(buyer).not.toBe(seller);
	});

	it('different recipient produces different asset_name for same kind', () => {
		const a = deriveAssetName('buyer_first_purchase', BUYER_PKH);
		const b = deriveAssetName('buyer_first_purchase', SELLER_PKH);
		expect(a).not.toBe(b);
	});

	it('rejects recipient_pkh that is too short', () => {
		expect(() => deriveAssetName('buyer_first_purchase', 'deadbeef')).toThrow('INVALID_RECIPIENT_PKH');
	});

	it('rejects recipient_pkh that is too long', () => {
		expect(() => deriveAssetName('buyer_first_purchase', BUYER_PKH + 'ff')).toThrow('INVALID_RECIPIENT_PKH');
	});

	it('rejects recipient_pkh with non-hex characters', () => {
		expect(() =>
			deriveAssetName('buyer_first_purchase', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),
		).toThrow('INVALID_RECIPIENT_PKH');
	});
});
