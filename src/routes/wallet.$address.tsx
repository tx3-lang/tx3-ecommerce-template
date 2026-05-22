import { createFileRoute } from '@tanstack/react-router';
import * as React from 'react';

import { BadgeList } from '@/components/badges/BadgeList';
import { Spinner } from '@/components/ui/spinner';
import { listBadgesByRecipient } from '@/server-fns/issued-badges';

interface WalletPageProps {
	address: string;
	badges: Database.IssuedBadge[] | null;
	loading: boolean;
	error: string | null;
}

export function WalletPage({ address, badges, loading, error }: WalletPageProps) {
	const networkProfile = import.meta.env.VITE_TX3_PROFILE ?? 'local';

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<Spinner className="size-12 mx-auto mb-4" />
					<p className="text-gray-600">Loading badges...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
						<span className="text-2xl">!</span>
					</div>
					<h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Badges</h1>
					<p className="text-gray-600">{error}</p>
				</div>
			</div>
		);
	}

	const truncatedAddress = address.length > 16 ? `${address.slice(0, 10)}...${address.slice(-6)}` : address;

	return (
		<div className="min-h-screen bg-gray-50 py-8">
			<div className="container mx-auto px-4 max-w-3xl">
				<div className="bg-white rounded-lg shadow-sm p-6 mb-6">
					<h1 data-testid="wallet-address-heading" className="text-2xl font-bold text-gray-900">
						{truncatedAddress}
					</h1>
				</div>

				{badges && badges.length > 0 ? (
					<BadgeList badges={badges} networkProfile={networkProfile} />
				) : (
					<div className="bg-white rounded-lg shadow-sm p-6">
						<p className="text-gray-500 text-center">No badges found for this address</p>
					</div>
				)}
			</div>
		</div>
	);
}

function WalletPageContainer() {
	const { address } = Route.useParams();
	const [badges, setBadges] = React.useState<Database.IssuedBadge[] | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		let cancelled = false;

		setLoading(true);
		setError(null);
		setBadges(null);

		listBadgesByRecipient(address)
			.then(data => {
				if (cancelled) return;
				setBadges(data);
				setLoading(false);
			})
			.catch(err => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : 'Unknown error');
				setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [address]);

	return <WalletPage address={address} badges={badges} loading={loading} error={error} />;
}

export const Route = createFileRoute('/wallet/$address')({
	component: WalletPageContainer,
});
