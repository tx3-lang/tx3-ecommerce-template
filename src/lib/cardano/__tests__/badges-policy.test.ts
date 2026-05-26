import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BADGE_POLICY_ID, getBadgeScriptRefUtxo, getPolicyId } from '../badges-policy.js';

describe('getPolicyId', () => {
	it('returns the configured BadgeMint policy id', () => {
		expect(getPolicyId()).toBe(BADGE_POLICY_ID);
	});

	it('is a 56-character lowercase hex string (28 bytes) without a 0x prefix', () => {
		const policyId = getPolicyId();
		expect(policyId).toHaveLength(56);
		expect(/^[0-9a-f]{56}$/.test(policyId)).toBe(true);
		expect(policyId).not.toMatch(/^0x/);
	});
});

describe('getBadgeScriptRefUtxo', () => {
	const PREV_TX = process.env.BADGE_SCRIPT_REF_TX_HASH;
	const PREV_IDX = process.env.BADGE_SCRIPT_REF_OUTPUT_INDEX;

	beforeEach(() => {
		delete process.env.BADGE_SCRIPT_REF_TX_HASH;
		delete process.env.BADGE_SCRIPT_REF_OUTPUT_INDEX;
	});

	afterEach(() => {
		if (PREV_TX === undefined) delete process.env.BADGE_SCRIPT_REF_TX_HASH;
		else process.env.BADGE_SCRIPT_REF_TX_HASH = PREV_TX;
		if (PREV_IDX === undefined) delete process.env.BADGE_SCRIPT_REF_OUTPUT_INDEX;
		else process.env.BADGE_SCRIPT_REF_OUTPUT_INDEX = PREV_IDX;
	});

	it('reads the published reference-script UTxO from env', () => {
		process.env.BADGE_SCRIPT_REF_TX_HASH = 'aa'.repeat(32);
		process.env.BADGE_SCRIPT_REF_OUTPUT_INDEX = '0';
		expect(getBadgeScriptRefUtxo()).toEqual({ txHash: 'aa'.repeat(32), outputIndex: 0 });
	});

	it('throws MISSING_ENV when BADGE_SCRIPT_REF_TX_HASH is absent', () => {
		process.env.BADGE_SCRIPT_REF_OUTPUT_INDEX = '0';
		expect(() => getBadgeScriptRefUtxo()).toThrow('MISSING_ENV: BADGE_SCRIPT_REF_TX_HASH');
	});

	it('throws MISSING_ENV when BADGE_SCRIPT_REF_OUTPUT_INDEX is absent', () => {
		process.env.BADGE_SCRIPT_REF_TX_HASH = 'aa'.repeat(32);
		expect(() => getBadgeScriptRefUtxo()).toThrow('MISSING_ENV: BADGE_SCRIPT_REF_OUTPUT_INDEX');
	});
});
