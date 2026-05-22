import { afterEach, describe, expect, it, vi } from 'vitest';

const FIXTURE_MERCHANT_PKH = 'aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd';
const ALT_MERCHANT_PKH = 'bbccddeebbccddeebbccddeebbccddeebbccddeebbccddeebbccddee';

const FIXTURE_COMPILED_CODE =
	'5901a3010100229800aba2aba1aba0aab9faab9eaab9dab9a9bae0024888888896600264653001300900198049805000cc0240092225980099b8748000c020dd500144c96600266e1d20003009375400915980098051baa004899912cc004c8cc004004dd618081808980898089808980898089808980898069baa0052259800800c528456600266e3cdd71808800805c528c4cc008008c04800500c201e8acc0066002b30010018a518a5040354a14a28052264660020026600600600444b30010018a518acc004cdc39bad30110014800a266004004602400314a0806100f452820148a50402844b30010018a5eb8226601c6018601e0026600400460200028068c96600266e1d2002300a375400314bd6f7b63044dd5980718059baa001402464660020026eacc038c03cc03cc03cc03cc02cdd5001912cc0040062980103d87a8000899192cc004cdc8802800c56600266e3c014006266e95200033010300e0024bd7045300103d87a80004031133004004301200340306eb8c030004c03c00500d45900b4590081bae300c3009375400516401c300900130043754013149a26cac80101';

const FIXTURE_HASH = '643aff72488e5a3c7b22806ce3db8f737b9181d3df968dad45f3d950';

const FIXTURE_PLUTUS_JSON = JSON.stringify({
	validators: [
		{
			title: 'badges.badges.mint',
			compiledCode: FIXTURE_COMPILED_CODE,
			hash: FIXTURE_HASH,
			parameters: [{ title: 'merchant_pkh', schema: { $ref: '#/definitions/aiken~1crypto~1VerificationKeyHash' } }],
		},
	],
});

vi.mock('node:fs', () => ({
	readFileSync: vi.fn((filePath: string) => {
		if (String(filePath).endsWith('plutus.json')) {
			return FIXTURE_PLUTUS_JSON;
		}
		throw new Error(`Unexpected readFileSync call: ${filePath}`);
	}),
}));

const loadFresh = async () => {
	vi.resetModules();
	const mod = await import('../badges-policy.js');
	return mod;
};

afterEach(() => {
	vi.resetModules();
});

describe('getPolicyId', () => {
	it('returns a 56-character lowercase hex string (28 bytes)', async () => {
		const { getPolicyId } = await loadFresh();
		const policyId = getPolicyId(FIXTURE_MERCHANT_PKH);
		expect(policyId).toHaveLength(56);
		expect(/^[0-9a-f]{56}$/.test(policyId)).toBe(true);
	});

	it('does not contain a 0x prefix', async () => {
		const { getPolicyId } = await loadFresh();
		const policyId = getPolicyId(FIXTURE_MERCHANT_PKH);
		expect(policyId).not.toMatch(/^0x/);
	});

	it('returns an identical result on successive calls with the same pkh', async () => {
		const { getPolicyId } = await loadFresh();
		const first = getPolicyId(FIXTURE_MERCHANT_PKH);
		const second = getPolicyId(FIXTURE_MERCHANT_PKH);
		expect(first).toBe(second);
	});

	it('produces a different policy_id when the merchant_pkh changes', async () => {
		const { getPolicyId } = await loadFresh();
		const first = getPolicyId(FIXTURE_MERCHANT_PKH);
		const second = getPolicyId(ALT_MERCHANT_PKH);
		expect(first).not.toBe(second);
	});
});

describe('getBadgesScriptCbor', () => {
	it('returns the compiledCode hex string from plutus.json', async () => {
		const { getBadgesScriptCbor } = await loadFresh();
		const cbor = getBadgesScriptCbor();
		expect(cbor).toBe(FIXTURE_COMPILED_CODE);
	});

	it('returns a non-empty string', async () => {
		const { getBadgesScriptCbor } = await loadFresh();
		expect(typeof getBadgesScriptCbor()).toBe('string');
		expect(getBadgesScriptCbor().length).toBeGreaterThan(0);
	});
});
