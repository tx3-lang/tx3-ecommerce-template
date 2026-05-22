// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EscrowStatusCardProps {
	escrow: Database.Escrow;
	networkProfile: string; // 'local' | 'preview' | ...
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_LABEL: Record<Database.EscrowStatus, string> = {
	pending: 'Awaiting Shipment',
	shipped: 'Shipped — awaiting release',
	released: 'Released',
	refunded: 'Refunded',
};

const TERMINAL_STATUSES: Database.EscrowStatus[] = ['released', 'refunded'];

function buildExplorerUrl(txHash: string, profile: string): string | null {
	if (profile === 'preview') {
		return `https://preview.cexplorer.io/tx/${txHash}`;
	}
	// 'local' and any unknown profile: no working public explorer
	return null;
}

function formatCountdown(deadlineIso: string): string {
	const msRemaining = Date.parse(deadlineIso) - Date.now();
	if (msRemaining <= 0) return 'Deadline passed';

	const totalMinutes = Math.floor(msRemaining / 60_000);
	const totalHours = Math.floor(totalMinutes / 60);
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	const minutes = totalMinutes % 60;

	if (days > 0) {
		return `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''} remaining`;
	}
	return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
}

function getDeadlineIso(escrow: Database.Escrow): string | null {
	if (escrow.status === 'pending') return escrow.ship_deadline;
	if (escrow.status === 'shipped') return escrow.grace_period_end ?? null;
	return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function EscrowStatusCard({ escrow, networkProfile }: EscrowStatusCardProps) {
	const isTerminal = TERMINAL_STATUSES.includes(escrow.status);
	const deadlineIso = getDeadlineIso(escrow);
	const countdownText = deadlineIso ? formatCountdown(deadlineIso) : null;
	const explorerUrl = buildExplorerUrl(escrow.utxo_tx_hash, networkProfile);

	const statusColors: Record<Database.EscrowStatus, string> = {
		pending: 'bg-yellow-100 text-yellow-800',
		shipped: 'bg-blue-100 text-blue-800',
		released: 'bg-green-100 text-green-800',
		refunded: 'bg-red-100 text-red-800',
	};

	return (
		<div className="bg-white rounded-lg shadow-sm p-6">
			<h2 className="text-lg font-semibold mb-4">Escrow Status</h2>

			<div className="space-y-3">
				{/* Status badge */}
				<div className="flex items-center gap-3">
					<span className="text-sm text-gray-600">Status</span>
					<span
						data-testid="escrow-status-label"
						className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[escrow.status]}`}
					>
						{STATUS_LABEL[escrow.status]}
					</span>
				</div>

				{/* Countdown (non-terminal states only) */}
				{!isTerminal && countdownText !== null && (
					<div className="flex items-center gap-3">
						<span className="text-sm text-gray-600">Deadline</span>
						<span
							data-testid="escrow-countdown"
							className={`text-sm font-medium ${countdownText === 'Deadline passed' ? 'text-red-600' : 'text-gray-900'}`}
						>
							{countdownText}
						</span>
					</div>
				)}

				{/* Lock TX reference */}
				<div className="mt-2">
					<p className="text-sm text-gray-600 mb-1">Lock Transaction</p>
					{explorerUrl ? (
						<a
							href={explorerUrl}
							target="_blank"
							rel="noopener noreferrer"
							data-testid="escrow-tx-hash"
							className="font-mono text-xs text-blue-600 hover:underline break-all"
							aria-label="View lock tx on explorer"
						>
							{escrow.utxo_tx_hash}
						</a>
					) : (
						<span data-testid="escrow-tx-hash" className="font-mono text-xs text-gray-500 break-all">
							{escrow.utxo_tx_hash}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
