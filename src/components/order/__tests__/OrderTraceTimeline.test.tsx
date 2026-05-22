// @vitest-environment jsdom
/**
 * Tests for src/components/order/OrderTraceTimeline.tsx
 *
 * Uses React Testing Library + jsdom.
 * The VITE_TX3_PROFILE env var is stubbed via import.meta.env before render.
 * No @testing-library/jest-dom — uses native DOM assertions throughout.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock import.meta.env so the component can read VITE_TX3_PROFILE in jsdom
// ---------------------------------------------------------------------------
vi.stubEnv('VITE_TX3_PROFILE', 'preview');

// Import AFTER stubbing env
const { OrderTraceTimeline } = await import('../OrderTraceTimeline.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const makeEvent = (overrides: Partial<Database.OrderEvent> = {}): Database.OrderEvent => ({
	id: 'evt-1',
	order_id: 'order-abc',
	event_type: 'paid',
	tx_hash: 'deadbeef1234567890abcdef',
	payload: { v: 1, event: 'paid' },
	submitted_at: '2026-05-21T10:00:00Z',
	confirmed_at: '2026-05-21T10:01:00Z',
	...overrides,
});

const PAID_EVENT = makeEvent({ event_type: 'paid', submitted_at: '2026-05-21T10:00:00Z' });
const SHIPPED_EVENT = makeEvent({
	id: 'evt-2',
	event_type: 'shipped',
	tx_hash: 'cafebabe1234567890abcdef',
	submitted_at: '2026-05-22T12:00:00Z',
	confirmed_at: '2026-05-22T12:01:00Z',
});
const PENDING_EVENT = makeEvent({
	id: 'evt-3',
	event_type: 'completed',
	tx_hash: 'aabbccdd1234567890abcdef',
	submitted_at: '2026-05-23T08:00:00Z',
	confirmed_at: null,
});

afterEach(() => {
	cleanup();
});

// ---------------------------------------------------------------------------
// Null / empty guard
// ---------------------------------------------------------------------------
describe('OrderTraceTimeline — null / empty events', () => {
	it('renders nothing when events is null', () => {
		const { container } = render(<OrderTraceTimeline events={null} />);
		expect(container.firstChild).toBeNull();
	});

	it('renders nothing when events is undefined', () => {
		const { container } = render(<OrderTraceTimeline events={undefined} />);
		expect(container.firstChild).toBeNull();
	});

	it('renders an empty-state placeholder when events is an empty array', () => {
		render(<OrderTraceTimeline events={[]} />);
		expect(screen.getByTestId('trace-empty')).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// One item per event
// ---------------------------------------------------------------------------
describe('OrderTraceTimeline — item count', () => {
	it('renders one item per event', () => {
		render(<OrderTraceTimeline events={[PAID_EVENT, SHIPPED_EVENT]} />);
		expect(screen.getAllByTestId('trace-item')).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// Humanized event-type labels
// ---------------------------------------------------------------------------
describe('OrderTraceTimeline — event type labels', () => {
	it.each([
		['paid', 'Paid'],
		['shipped', 'Shipped'],
		['completed', 'Completed'],
		['cancelled', 'Cancelled'],
	] as [Database.OrderEventType, string][])('renders "%s" as "%s"', (eventType, label) => {
		render(<OrderTraceTimeline events={[makeEvent({ event_type: eventType })]} />);
		expect(screen.getByText(label)).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Timestamp display
// ---------------------------------------------------------------------------
describe('OrderTraceTimeline — timestamp', () => {
	it('displays a formatted timestamp from submitted_at', () => {
		render(<OrderTraceTimeline events={[PAID_EVENT]} />);
		// The component renders a human-readable date; assert the element exists
		expect(screen.getByTestId('trace-timestamp-evt-1')).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Explorer link — preview profile
// ---------------------------------------------------------------------------
describe('OrderTraceTimeline — explorer links (preview profile)', () => {
	it('renders an anchor pointing to preview.cexplorer.io for a confirmed event', () => {
		render(<OrderTraceTimeline events={[PAID_EVENT]} />);
		const link = screen.getByRole('link', { name: /view on explorer/i });
		expect(link.getAttribute('href')).toBe(`https://preview.cexplorer.io/tx/${PAID_EVENT.tx_hash}`);
	});
});

// ---------------------------------------------------------------------------
// Explorer link — local profile (no working link)
// The component reads import.meta.env.VITE_TX3_PROFILE at render time, so
// vi.stubEnv takes effect immediately without needing a module reset.
// ---------------------------------------------------------------------------
describe('OrderTraceTimeline — local profile (no explorer link)', () => {
	beforeEach(() => {
		vi.stubEnv('VITE_TX3_PROFILE', 'local');
	});

	afterEach(() => {
		vi.stubEnv('VITE_TX3_PROFILE', 'preview');
		cleanup();
	});

	it('does NOT render an anchor tag for local profile', () => {
		render(<OrderTraceTimeline events={[PAID_EVENT]} />);
		// No link should exist; hash is shown as plain text
		expect(screen.queryByRole('link', { name: /view on explorer/i })).toBeNull();
		expect(screen.getByTestId('trace-hash-evt-1')).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Confirmed vs Pending badge
// ---------------------------------------------------------------------------
describe('OrderTraceTimeline — confirmation status badges', () => {
	it('shows "Confirmed" badge when confirmed_at is set', () => {
		render(<OrderTraceTimeline events={[PAID_EVENT]} />);
		const badge = screen.getByTestId('trace-badge-evt-1');
		expect(badge.textContent).toBe('Confirmed');
	});

	it('shows "Pending" badge when confirmed_at is null', () => {
		render(<OrderTraceTimeline events={[PENDING_EVENT]} />);
		const badge = screen.getByTestId('trace-badge-evt-3');
		expect(badge.textContent).toBe('Pending');
	});
});

// ---------------------------------------------------------------------------
// Ordering: earliest event at top
// ---------------------------------------------------------------------------
describe('OrderTraceTimeline — event ordering', () => {
	it('renders events sorted by submitted_at ascending (earliest first)', () => {
		// Supply events in reverse order to confirm the component sorts them
		render(<OrderTraceTimeline events={[SHIPPED_EVENT, PAID_EVENT]} />);
		const items = screen.getAllByTestId('trace-item');
		// First item should be PAID (earlier date), second SHIPPED
		expect(items[0]?.getAttribute('data-event-id')).toBe(PAID_EVENT.id);
		expect(items[1]?.getAttribute('data-event-id')).toBe(SHIPPED_EVENT.id);
	});
});
