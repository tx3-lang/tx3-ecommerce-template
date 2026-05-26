import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_ENV = {
	TX3_TRP_ENDPOINT: 'http://localhost:50051',
	TX3_PROFILE: 'local',
	MERCHANT_ADDRESS:
		'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae',
	METADATA_LABEL: '1337',
};

// Helper that loads a fresh module after each env mutation
const loadFresh = async () => {
	vi.resetModules();
	const mod = await import('../network.js');
	return mod;
};

beforeEach(() => {
	for (const [key, value] of Object.entries(VALID_ENV)) {
		process.env[key] = value;
	}
});

afterEach(() => {
	for (const key of Object.keys(VALID_ENV)) {
		delete process.env[key];
	}
	vi.resetModules();
});

describe('getNetworkConfig', () => {
	describe('returns config when all required env vars are set', () => {
		it('returns correct trpEndpoint', async () => {
			const { getNetworkConfig } = await loadFresh();
			expect(getNetworkConfig().trpEndpoint).toBe('http://localhost:50051');
		});

		it('returns correct profile', async () => {
			const { getNetworkConfig } = await loadFresh();
			expect(getNetworkConfig().profile).toBe('local');
		});

		it('returns correct merchantAddress', async () => {
			const { getNetworkConfig } = await loadFresh();
			expect(getNetworkConfig().merchantAddress).toBe(VALID_ENV.MERCHANT_ADDRESS);
		});

		it('returns metadataLabel as a number', async () => {
			const { getNetworkConfig } = await loadFresh();
			expect(getNetworkConfig().metadataLabel).toBe(1337);
		});
	});

	describe('defaults METADATA_LABEL to 1337 when unset', () => {
		it('uses default label 1337', async () => {
			delete process.env.METADATA_LABEL;
			const { getNetworkConfig } = await loadFresh();
			expect(getNetworkConfig().metadataLabel).toBe(1337);
		});
	});

	describe('throws MISSING_ENV when a required var is missing', () => {
		it('throws when TX3_TRP_ENDPOINT is missing', async () => {
			delete process.env.TX3_TRP_ENDPOINT;
			const { getNetworkConfig } = await loadFresh();
			expect(() => getNetworkConfig()).toThrow('MISSING_ENV: TX3_TRP_ENDPOINT');
		});

		it('throws when TX3_PROFILE is missing', async () => {
			delete process.env.TX3_PROFILE;
			const { getNetworkConfig } = await loadFresh();
			expect(() => getNetworkConfig()).toThrow('MISSING_ENV: TX3_PROFILE');
		});

		it('throws when MERCHANT_ADDRESS is missing', async () => {
			delete process.env.MERCHANT_ADDRESS;
			const { getNetworkConfig } = await loadFresh();
			expect(() => getNetworkConfig()).toThrow('MISSING_ENV: MERCHANT_ADDRESS');
		});
	});

	describe('profile validation', () => {
		it('accepts "local" as a valid profile', async () => {
			process.env.TX3_PROFILE = 'local';
			const { getNetworkConfig } = await loadFresh();
			expect(() => getNetworkConfig()).not.toThrow();
			expect(getNetworkConfig().profile).toBe('local');
		});

		it('accepts "preview" as a valid profile', async () => {
			process.env.TX3_PROFILE = 'preview';
			const { getNetworkConfig } = await loadFresh();
			expect(() => getNetworkConfig()).not.toThrow();
			expect(getNetworkConfig().profile).toBe('preview');
		});

		it('throws INVALID_PROFILE for an unknown value', async () => {
			process.env.TX3_PROFILE = 'mainnet';
			const { getNetworkConfig } = await loadFresh();
			expect(() => getNetworkConfig()).toThrow('INVALID_PROFILE');
		});

		it('throws for an empty profile value (treated as missing)', async () => {
			process.env.TX3_PROFILE = '';
			const { getNetworkConfig } = await loadFresh();
			expect(() => getNetworkConfig()).toThrow();
		});
	});

	describe('METADATA_LABEL validation', () => {
		it('throws INVALID_ENV when METADATA_LABEL is a non-numeric string', async () => {
			process.env.METADATA_LABEL = 'foo';
			const { getNetworkConfig } = await loadFresh();
			expect(() => getNetworkConfig()).toThrow('INVALID_ENV');
			expect(() => getNetworkConfig()).toThrow('METADATA_LABEL');
		});

		it('uses default 1337 when METADATA_LABEL is an empty string', async () => {
			process.env.METADATA_LABEL = '';
			const { getNetworkConfig } = await loadFresh();
			expect(getNetworkConfig().metadataLabel).toBe(1337);
		});
	});

	describe('memoisation', () => {
		it('returns the same object reference on repeated calls', async () => {
			const { getNetworkConfig } = await loadFresh();
			const first = getNetworkConfig();
			const second = getNetworkConfig();
			expect(first).toBe(second);
		});
	});
});
