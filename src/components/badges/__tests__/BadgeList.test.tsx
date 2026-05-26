// @vitest-environment jsdom
/**
 * Tests for src/components/badges/BadgeList.tsx
 *
 * Uses React Testing Library + jsdom.
 * No @testing-library/jest-dom — uses native DOM assertions throughout.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

const { BadgeList } = await import('../BadgeList.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const makeBadge = (overrides: Partial<Database.IssuedBadge> = {}): Database.IssuedBadge => ({
	id: 'badge-1',
	kind: 'buyer_first_purchase',
	recipient_pkh: 'aabbccdd',
	recipient_address: 'addr_test1abc',
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
// Rendering badges
// ---------------------------------------------------------------------------
describe('BadgeList — rendering', () => {
	it('renders one card per badge passed in props', () => {
		const badges = [makeBadge({ id: 'badge-a' }), makeBadge({ id: 'badge-b' }), makeBadge({ id: 'badge-c' })];
		render(<BadgeList badges={badges} networkProfile="preview" />);
		const cards = screen.getAllByTestId('badge-card');
		expect(cards.length).toBe(3);
	});

	it('each card shows the badge name', () => {
		const badges = [
			makeBadge({ id: 'badge-a', metadata: { name: 'My Badge', image: 'ipfs://x', description: 'desc' } }),
		];
		render(<BadgeList badges={badges} networkProfile="preview" />);
		const nameEl = screen.getByTestId('badge-name');
		expect(nameEl.textContent).toBe('My Badge');
	});

	it('each card shows the badge description', () => {
		const badges = [
			makeBadge({ id: 'badge-a', metadata: { name: 'My Badge', description: 'A nice description' } }),
		];
		render(<BadgeList badges={badges} networkProfile="preview" />);
		expect(screen.getByText('A nice description')).toBeTruthy();
	});

	it('reads name/description from a CIP-25 (721) nested payload', () => {
		const badges = [
			makeBadge({
				id: 'badge-cip25',
				policy_id: 'pol123',
				asset_name_hex: 'aa11',
				metadata: {
					'721': {
						pol123: {
							aa11: { name: 'Nested Badge', description: 'Nested description' },
						},
					},
				},
			}),
		];
		render(<BadgeList badges={badges} networkProfile="preview" />);
		expect(screen.getByTestId('badge-name').textContent).toBe('Nested Badge');
		expect(screen.getByText('Nested description')).toBeTruthy();
	});

	it('does not render a badge image', () => {
		const badges = [makeBadge()];
		render(<BadgeList badges={badges} networkProfile="preview" />);
		expect(screen.queryByTestId('badge-image')).toBeNull();
	});

	it('renders explorer link on preview network', () => {
		const txHash = 'eeff00112233445566778899aabbccddeeff00112233445566778899aabbccdd';
		const badges = [makeBadge({ mint_tx_hash: txHash })];
		render(<BadgeList badges={badges} networkProfile="preview" />);
		const link = screen.getByRole('link', { name: /view on explorer/i });
		expect(link.getAttribute('href')).toBe(`https://preview.cexplorer.io/tx/${txHash}`);
	});

	it('does not render explorer link on local network', () => {
		const badges = [makeBadge()];
		render(<BadgeList badges={badges} networkProfile="local" />);
		expect(screen.queryByRole('link', { name: /view on explorer/i })).toBeNull();
	});

	it('shows mint tx hash as plain text on local network', () => {
		const txHash = 'eeff00112233445566778899aabbccddeeff00112233445566778899aabbccdd';
		const badges = [makeBadge({ mint_tx_hash: txHash })];
		render(<BadgeList badges={badges} networkProfile="local" />);
		const hashEl = screen.getByTestId('badge-tx-hash');
		expect(hashEl.textContent).toContain(txHash);
	});
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('BadgeList — empty state', () => {
	it('renders "No badges yet" when badges array is empty', () => {
		render(<BadgeList badges={[]} networkProfile="preview" />);
		expect(screen.getByText('No badges yet')).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------
describe('BadgeList — ordering', () => {
	it('orders badges by minted_at descending (most recent first)', () => {
		const old = makeBadge({
			id: 'oldest',
			minted_at: '2026-01-01T00:00:00Z',
			metadata: { name: 'Old Badge', image: 'ipfs://x', description: 'old' },
		});
		const mid = makeBadge({
			id: 'middle',
			minted_at: '2026-04-15T00:00:00Z',
			metadata: { name: 'Mid Badge', image: 'ipfs://x', description: 'mid' },
		});
		const recent = makeBadge({
			id: 'newest',
			minted_at: '2026-05-20T10:00:00Z',
			metadata: { name: 'New Badge', image: 'ipfs://x', description: 'new' },
		});
		const badges = [mid, old, recent]; // unsorted
		render(<BadgeList badges={badges} networkProfile="preview" />);
		const names = screen.getAllByTestId('badge-name');
		expect(names[0].textContent).toBe('New Badge');
		expect(names[1].textContent).toBe('Mid Badge');
		expect(names[2].textContent).toBe('Old Badge');
	});
});
