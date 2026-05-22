// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BadgeListProps {
	badges: Database.IssuedBadge[];
	networkProfile?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

function resolveIpfsUrl(url: string): string {
	if (url.startsWith('ipfs://')) {
		return `${IPFS_GATEWAY}${url.slice(7)}`;
	}
	return url;
}

function buildExplorerUrl(txHash: string, profile?: string): string | null {
	if (profile === 'preview') {
		return `https://preview.cexplorer.io/tx/${txHash}`;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function BadgeList({ badges, networkProfile }: BadgeListProps) {
	if (badges.length === 0) {
		return (
			<div className="bg-white rounded-lg shadow-sm p-6">
				<p className="text-gray-500 text-center">No badges yet</p>
			</div>
		);
	}

	const sorted = [...badges].sort((a, b) => new Date(b.minted_at).getTime() - new Date(a.minted_at).getTime());

	return (
		<div className="space-y-4">
			{sorted.map(badge => {
				const imageUrl = resolveIpfsUrl(String(badge.metadata.image ?? ''));
				const explorerUrl = buildExplorerUrl(badge.mint_tx_hash, networkProfile);

				return (
					<div key={badge.id} data-testid="badge-card" className="bg-white rounded-lg shadow-sm p-6">
						<div className="flex items-start gap-4">
							<img
								data-testid="badge-image"
								src={imageUrl}
								alt={String(badge.metadata.name ?? 'Badge')}
								className="w-16 h-16 rounded-lg object-cover"
							/>
							<div className="flex-1 min-w-0">
								<h3 data-testid="badge-name" className="text-lg font-semibold">
									{String(badge.metadata.name ?? '')}
								</h3>
								{badge.metadata.description != null && (
									<p className="text-sm text-gray-600 mt-1">{String(badge.metadata.description)}</p>
								)}
								<div className="mt-2">
									{explorerUrl ? (
										<a
											href={explorerUrl}
											target="_blank"
											rel="noopener noreferrer"
											data-testid="badge-tx-hash"
											className="font-mono text-xs text-blue-600 hover:underline break-all"
											aria-label="View on explorer"
										>
											{badge.mint_tx_hash}
										</a>
									) : (
										<span data-testid="badge-tx-hash" className="font-mono text-xs text-gray-500 break-all">
											{badge.mint_tx_hash}
										</span>
									)}
								</div>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
