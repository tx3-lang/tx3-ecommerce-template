// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Props {
	events: Database.OrderEvent[] | null | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const LABEL_MAP: Record<Database.OrderEventType, string> = {
	paid: 'Paid',
	shipped: 'Shipped',
	completed: 'Completed',
	cancelled: 'Cancelled',
};

function humanizeEventType(eventType: Database.OrderEventType): string {
	return LABEL_MAP[eventType] ?? eventType;
}

function buildExplorerUrl(txHash: string, profile: string): string | null {
	if (profile === 'preview') {
		return `https://preview.cexplorer.io/tx/${txHash}`;
	}
	// 'local' and any unknown profile: no working public explorer
	return null;
}

function formatTimestamp(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function OrderTraceTimeline({ events }: Props) {
	// Read the profile at render time so vi.stubEnv works in tests
	const profile = import.meta.env.VITE_TX3_PROFILE ?? 'local';

	// null / undefined — render nothing
	if (events == null) return null;

	// Sort by submitted_at ascending (earliest at top)
	const sorted = [...events].sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());

	// empty array — render placeholder
	if (sorted.length === 0) {
		return (
			<div data-testid="trace-empty" className="text-sm text-gray-500 italic">
				No on-chain events recorded yet.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{sorted.map((event, index) => {
				const explorerUrl = buildExplorerUrl(event.tx_hash, profile);
				const isConfirmed = event.confirmed_at !== null;
				const isLast = index === sorted.length - 1;

				return (
					<div key={event.id} data-testid="trace-item" data-event-id={event.id} className="flex gap-4">
						{/* Timeline connector */}
						<div className="flex flex-col items-center">
							<div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${isConfirmed ? 'bg-green-500' : 'bg-yellow-400'}`} />
							{!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
						</div>

						{/* Event body */}
						<div className="flex-1 pb-4">
							<div className="flex items-start justify-between gap-2 flex-wrap">
								<span className="font-semibold text-gray-900">{humanizeEventType(event.event_type)}</span>
								<span
									data-testid={`trace-badge-${event.id}`}
									className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
										isConfirmed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
									}`}
								>
									{isConfirmed ? 'Confirmed' : 'Pending'}
								</span>
							</div>

							<p data-testid={`trace-timestamp-${event.id}`} className="text-sm text-gray-500 mt-0.5">
								{formatTimestamp(event.submitted_at)}
							</p>

							<div className="mt-1">
								{explorerUrl ? (
									<a
										href={explorerUrl}
										target="_blank"
										rel="noopener noreferrer"
										data-testid={`trace-hash-${event.id}`}
										className="font-mono text-xs text-blue-600 hover:underline break-all"
										aria-label="View on explorer"
									>
										{event.tx_hash}
									</a>
								) : (
									<span data-testid={`trace-hash-${event.id}`} className="font-mono text-xs text-gray-500 break-all">
										{event.tx_hash}
									</span>
								)}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
