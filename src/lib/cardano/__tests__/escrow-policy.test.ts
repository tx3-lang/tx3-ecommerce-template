import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fixture: minimal plutus.json with only what our module needs
const FIXTURE_PLUTUS_JSON = JSON.stringify({
	validators: [
		{
			title: 'escrow.escrow.spend',
			hash: 'fc7d512718ecf83ae3267b9dd69f6ecd4737bb8e5e14bb047c3e1c83',
		},
	],
});

// Mock node:fs so readFileSync returns our fixture
vi.mock('node:fs', () => ({
	readFileSync: vi.fn((filePath: string) => {
		if (String(filePath).endsWith('plutus.json')) {
			return FIXTURE_PLUTUS_JSON;
		}
		throw new Error(`Unexpected readFileSync call: ${filePath}`);
	}),
}));

const VALID_ENV = {
	TX3_TRP_ENDPOINT: 'http://localhost:50051',
	TX3_PROFILE: 'local',
	MERCHANT_ADDRESS:
		'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae',
};

// Helper: reload fresh module after env changes
const loadFresh = async () => {
	vi.resetModules();
	const mod = await import('../escrow-policy.js');
	return mod;
};

beforeEach(() => {
	// Set up valid network env vars
	for (const [key, value] of Object.entries(VALID_ENV)) {
		process.env[key] = value;
	}
});

afterEach(() => {
	for (const key of Object.keys(VALID_ENV)) {
		delete process.env[key];
	}
	delete process.env.ESCROW_SHIP_DEADLINE_SECONDS;
	delete process.env.ESCROW_GRACE_PERIOD_SECONDS;
	vi.resetModules();
});

describe('getScriptAddress', () => {
	it('returns a bech32 addr_test address for testnet (local profile)', async () => {
		process.env.TX3_PROFILE = 'local';
		const { getScriptAddress } = await loadFresh();
		const address = getScriptAddress();
		expect(address).toMatch(/^addr_test1/);
	});

	it('returns a bech32 addr_test address for testnet (preview profile)', async () => {
		process.env.TX3_PROFILE = 'preview';
		const { getScriptAddress } = await loadFresh();
		const address = getScriptAddress();
		expect(address).toMatch(/^addr_test1/);
	});

	it('reads the script hash from plutus.json (escrow.escrow.spend validator)', async () => {
		const { getScriptAddress } = await loadFresh();
		const address = getScriptAddress();
		// The address must be non-empty and a valid bech32 string
		expect(address.length).toBeGreaterThan(10);
		expect(address).toContain('1'); // bech32 separator
	});

	it('is a string', async () => {
		const { getScriptAddress } = await loadFresh();
		expect(typeof getScriptAddress()).toBe('string');
	});
});

describe('getShipDeadlineSeconds', () => {
	it('returns the default of 2592000 when env var is not set', async () => {
		const { getShipDeadlineSeconds } = await loadFresh();
		expect(getShipDeadlineSeconds()).toBe(2592000);
	});

	it('reads from ESCROW_SHIP_DEADLINE_SECONDS env var when set', async () => {
		process.env.ESCROW_SHIP_DEADLINE_SECONDS = '300';
		const { getShipDeadlineSeconds } = await loadFresh();
		expect(getShipDeadlineSeconds()).toBe(300);
	});

	it('returns a number (not a string)', async () => {
		const { getShipDeadlineSeconds } = await loadFresh();
		expect(typeof getShipDeadlineSeconds()).toBe('number');
	});
});

describe('getGracePeriodSeconds', () => {
	it('returns the default of 1209600 when env var is not set', async () => {
		const { getGracePeriodSeconds } = await loadFresh();
		expect(getGracePeriodSeconds()).toBe(1209600);
	});

	it('reads from ESCROW_GRACE_PERIOD_SECONDS env var when set', async () => {
		process.env.ESCROW_GRACE_PERIOD_SECONDS = '300';
		const { getGracePeriodSeconds } = await loadFresh();
		expect(getGracePeriodSeconds()).toBe(300);
	});

	it('returns a number (not a string)', async () => {
		const { getGracePeriodSeconds } = await loadFresh();
		expect(typeof getGracePeriodSeconds()).toBe('number');
	});
});
