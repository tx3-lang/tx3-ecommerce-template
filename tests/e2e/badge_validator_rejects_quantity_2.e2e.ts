/**
 * E2E: badge_validator_rejects_quantity_2
 *
 * Validator constraint: the badges minting policy must enforce quantity = 1
 * per mint transaction (minting 2 at once must be rejected by the on-chain
 * script).
 *
 * This test is currently skipped because it requires raw CBOR tx construction
 * (modifying the resolved tx envelope quantity before submission). The
 * tx3-sdk mintBadge method always produces a tx with quantity=1, and there is
 * no public API to override the mint amount.
 *
 * When raw tx construction becomes available (e.g. via a low-level CBOR
 * builder or a custom submit with a hand-crafted tx), this test should:
 *   1. Build a mint tx with quantity=2 via the badges policy
 *   2. Sign it with the merchant skey
 *   3. Submit it to the TRP endpoint
 *   4. Assert the submit fails with a script validation error
 */

import { describe, it } from 'vitest';

describe('badge_validator_rejects_quantity_2.e2e', () => {
	it.skip('rejects mint with quantity > 1 (requires raw tx construction)', () => {
		// TODO: Requires raw CBOR tx construction to bypass tx3-sdk validation.
		// The on-chain badges minting validator enforces quantity=1 per mint tx.
		// Unit tests in scripts/__tests__/mint-badge.test.ts cover the CLI-side
		// validation, but an e2e test requires the ability to submit a modified
		// tx envelope directly.
	});
});
