// @vitest-environment jsdom
/**
 * Tests for src/components/order/EscrowStatusCard.tsx
 *
 * Uses React Testing Library + jsdom.
 * No @testing-library/jest-dom — uses native DOM assertions throughout.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

const { EscrowStatusCard } = await import('../EscrowStatusCard.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const makeEscrow = (overrides: Partial<Database.Escrow> = {}): Database.Escrow => ({
	id: 'escrow-1',
	order_id: 'order-abc',
	script_address: 'addr_test1...',
	utxo_tx_hash: 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
	utxo_output_index: 0,
	status: 'pending',
	buyer_pkh: 'buyerpkh',
	merchant_pkh: 'merchantpkh',
	paid_at: '2026-05-20T10:00:00Z',
	// ship_deadline is 7 days in the future by default
	ship_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
	grace_period_end: null,
	datum_cbor: 'abc',
	shipped_tx_hash: null,
	release_tx_hash: null,
	refund_tx_hash: null,
	created_at: '2026-05-20T10:00:00Z',
	updated_at: '2026-05-20T10:00:00Z',
	...overrides,
});

afterEach(() => {
	cleanup();
});

// ---------------------------------------------------------------------------
// Status labels
// ---------------------------------------------------------------------------
describe('EscrowStatusCard — status labels', () => {
	it('renders "Awaiting Shipment" for pending status', () => {
		render(<EscrowStatusCard escrow={makeEscrow({ status: 'pending' })} networkProfile="preview" />);
		expect(screen.getByTestId('escrow-status-label').textContent).toBe('Awaiting Shipment');
	});

	it('renders "Shipped — awaiting release" for shipped status', () => {
		const escrow = makeEscrow({
			status: 'shipped',
			grace_period_end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
		});
		render(<EscrowStatusCard escrow={escrow} networkProfile="preview" />);
		expect(screen.getByTestId('escrow-status-label').textContent).toBe('Shipped — awaiting release');
	});

	it('renders "Released" for released status', () => {
		render(<EscrowStatusCard escrow={makeEscrow({ status: 'released' })} networkProfile="preview" />);
		expect(screen.getByTestId('escrow-status-label').textContent).toBe('Released');
	});

	it('renders "Refunded" for refunded status', () => {
		render(<EscrowStatusCard escrow={makeEscrow({ status: 'refunded' })} networkProfile="preview" />);
		expect(screen.getByTestId('escrow-status-label').textContent).toBe('Refunded');
	});
});

// ---------------------------------------------------------------------------
// Countdown display
// ---------------------------------------------------------------------------
describe('EscrowStatusCard — countdown', () => {
	it('shows countdown to ship_deadline when status is pending', () => {
		const futureDeadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
		render(
			<EscrowStatusCard
				escrow={makeEscrow({ status: 'pending', ship_deadline: futureDeadline })}
				networkProfile="local"
			/>,
		);
		const countdown = screen.getByTestId('escrow-countdown');
		// Should show "X days" or "X hours" — not "Deadline passed"
		expect(countdown.textContent).not.toBe('');
		expect(countdown.textContent).not.toContain('Deadline passed');
	});

	it('shows countdown to grace_period_end when status is shipped', () => {
		const futureGrace = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
		const escrow = makeEscrow({ status: 'shipped', grace_period_end: futureGrace });
		render(<EscrowStatusCard escrow={escrow} networkProfile="local" />);
		const countdown = screen.getByTestId('escrow-countdown');
		expect(countdown.textContent).not.toBe('');
		expect(countdown.textContent).not.toContain('Deadline passed');
	});

	it('shows "Deadline passed" when deadline is in the past for pending', () => {
		const pastDeadline = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
		render(
			<EscrowStatusCard
				escrow={makeEscrow({ status: 'pending', ship_deadline: pastDeadline })}
				networkProfile="local"
			/>,
		);
		const countdown = screen.getByTestId('escrow-countdown');
		expect(countdown.textContent).toBe('Deadline passed');
	});

	it('hides countdown for released status (terminal)', () => {
		render(<EscrowStatusCard escrow={makeEscrow({ status: 'released' })} networkProfile="preview" />);
		expect(screen.queryByTestId('escrow-countdown')).toBeNull();
	});

	it('hides countdown for refunded status (terminal)', () => {
		render(<EscrowStatusCard escrow={makeEscrow({ status: 'refunded' })} networkProfile="preview" />);
		expect(screen.queryByTestId('escrow-countdown')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Explorer link
// ---------------------------------------------------------------------------
describe('EscrowStatusCard — explorer link', () => {
	it('renders a link to preview.cexplorer.io for preview network', () => {
		const escrow = makeEscrow({ utxo_tx_hash: 'abc123' });
		render(<EscrowStatusCard escrow={escrow} networkProfile="preview" />);
		const link = screen.getByRole('link', { name: /view lock tx/i });
		expect(link.getAttribute('href')).toBe('https://preview.cexplorer.io/tx/abc123');
	});

	it('renders plain text hash (no link) for local network', () => {
		const escrow = makeEscrow({ utxo_tx_hash: 'abc123' });
		render(<EscrowStatusCard escrow={escrow} networkProfile="local" />);
		// No explorer link for local
		expect(screen.queryByRole('link', { name: /view lock tx/i })).toBeNull();
		// Hash shown as plain text
		expect(screen.getByTestId('escrow-tx-hash').textContent).toContain('abc123');
	});
});
