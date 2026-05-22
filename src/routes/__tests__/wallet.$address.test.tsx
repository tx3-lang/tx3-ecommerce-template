// @vitest-environment jsdom
/**
 * Tests for src/routes/wallet.$address.tsx
 *
 * Uses React Testing Library + jsdom.
 * No @testing-library/jest-dom — uses native DOM assertions throughout.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

const { WalletPage } = await import('../wallet.$address.js');

const TEST_ADDRESS = 'addr_test1qp0uxjlswg5sx7l2x6z9y6l3k5p8q7r9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4';

const makeBadge = (overrides: Partial<Database.IssuedBadge> = {}): Database.IssuedBadge => ({
	id: 'badge-1',
	kind: 'buyer_first_purchase',
	recipient_pkh: 'aabbccdd',
	recipient_address: TEST_ADDRESS,
	triggering_order_id: 'order-1',
	policy_id: 'abc123',
	asset_name_hex: '0a0b0c',
	mint_tx_hash: 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
	metadata: {
		name: 'First Purchase Badge',
		image: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
		description: 'Awarded for your first purchase',
	},
	minted_at: '2026-05-20T10:00:00Z',
	...overrides,
});

afterEach(() => {
	cleanup();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe('WalletPage — loading state', () => {
	it('shows a spinner while badges are being fetched', () => {
		render(<WalletPage address={TEST_ADDRESS} badges={null} loading={true} error={null} />);

		expect(screen.getByRole('status', { name: /loading/i })).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
describe('WalletPage — error state', () => {
	it('shows an error message when fetching badges fails', () => {
		render(<WalletPage address={TEST_ADDRESS} badges={null} loading={false} error="Network error" />);

		expect(screen.getByText(/error loading badges/i)).toBeTruthy();
		expect(screen.getByText('Network error')).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('WalletPage — empty state', () => {
	it('shows "No badges found for this address" when address has no badges', () => {
		render(<WalletPage address={TEST_ADDRESS} badges={[]} loading={false} error={null} />);

		expect(screen.getByText(/no badges found/i)).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Success — address rendering
// ---------------------------------------------------------------------------
describe('WalletPage — success state', () => {
	it('renders the truncated address as a heading', () => {
		render(<WalletPage address={TEST_ADDRESS} badges={[makeBadge()]} loading={false} error={null} />);

		const heading = screen.getByTestId('wallet-address-heading');
		expect(heading).toBeTruthy();
		expect(heading.textContent).toContain('addr_test1');
		expect(heading.textContent).toContain('g3h4');
		expect(heading.textContent).toContain('...');
	});

	it('renders BadgeList with the fetched badges', () => {
		const badges = [makeBadge({ id: 'badge-a' }), makeBadge({ id: 'badge-b' })];
		render(<WalletPage address={TEST_ADDRESS} badges={badges} loading={false} error={null} />);

		const cards = screen.getAllByTestId('badge-card');
		expect(cards.length).toBe(2);
	});
});
