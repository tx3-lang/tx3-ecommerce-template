// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BadgeListProps {
	badges: Database.IssuedBadge[];
	networkProfile?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Badge display fields are persisted as a CIP-25 payload
 * (`metadata['721'][policyId][assetName] = { name, image, description, ... }`),
 * but older/test rows store them flat at the metadata root. Resolve both shapes
 * to the inner record so the card always finds name/description.
 */
function extractDisplayMeta(badge: Database.IssuedBadge): Record<string, unknown> {
	const meta = (badge.metadata ?? {}) as Record<string, unknown>;
	const cip25 = meta['721'];

	if (cip25 && typeof cip25 === 'object') {
		const policies = cip25 as Record<string, unknown>;
		const byPolicy = (policies[badge.policy_id] ?? Object.values(policies)[0]) as Record<string, unknown> | undefined;

		if (byPolicy && typeof byPolicy === 'object') {
			const byAsset = (byPolicy[badge.asset_name_hex] ?? Object.values(byPolicy)[0]) as
				| Record<string, unknown>
				| undefined;

			if (byAsset && typeof byAsset === 'object') {
				return byAsset;
			}
		}
	}

	return meta;
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
				const meta = extractDisplayMeta(badge);
				const name = String(meta.name ?? 'Badge');
				const description = meta.description != null ? String(meta.description) : null;
				const explorerUrl = buildExplorerUrl(badge.mint_tx_hash, networkProfile);

				return (
					<div key={badge.id} data-testid="badge-card" className="bg-white rounded-lg shadow-sm p-6">
						<div className="flex items-start gap-4">
							<div className="flex-1 min-w-0">
								<h3 data-testid="badge-name" className="text-lg font-semibold">
									{name}
								</h3>
								{description != null && <p className="text-sm text-gray-600 mt-1">{description}</p>}
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
