import { Skeleton } from '@/components/ui/skeleton';

export function CartSummarySkeleton() {
	return (
		<div className="bg-white rounded-lg border p-6">
			{/* Header */}
			<Skeleton className="h-6 w-32 mb-6" />

			{/* Summary Items */}
			<div className="space-y-3 mb-6">
				<div className="flex justify-between">
					<Skeleton className="h-4 w-20" />
					<Skeleton className="h-4 w-16" />
				</div>
				<div className="flex justify-between">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-16" />
				</div>
			</div>

			{/* Divider */}
			<div className="border-t mb-4" />

			{/* Total */}
			<div className="flex justify-between mb-6">
				<Skeleton className="h-5 w-16" />
				<Skeleton className="h-6 w-20" />
			</div>

			{/* Checkout Button */}
			<Skeleton className="h-12 w-full" />
		</div>
	);
}
