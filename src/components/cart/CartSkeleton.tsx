// Components
import { Skeleton } from '@/components/ui/skeleton';

// Local
import { CartItemSkeleton } from './CartItemSkeleton';
import { CartSummarySkeleton } from './CartSummarySkeleton';

export function CartSkeleton() {
	return (
		<div className="min-h-screen bg-gray-50">
			<div className="container mx-auto px-4 py-8">
				{/* Page Header Skeleton */}
				<div className="mb-8">
					<Skeleton className="h-9 w-48 mb-2" />
					<Skeleton className="h-5 w-32" />
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
					{/* Cart Items Section Skeleton */}
					<div className="lg:col-span-2">
						<div className="bg-white rounded-lg border">
							{/* Cart Items Header Skeleton */}
							<div className="p-6 border-b">
								<Skeleton className="h-6 w-32" />
							</div>

							{/* Cart Items List Skeleton */}
							<div className="divide-y">
								{/* Show 2-3 skeleton items */}
								<div className="p-6">
									<CartItemSkeleton />
								</div>
							</div>

							{/* Cart Footer Skeleton */}
							<div className="p-6 border-t">
								<div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
									<Skeleton className="h-4 w-48" />
									<Skeleton className="h-4 w-24" />
								</div>
							</div>
						</div>
					</div>

					{/* Order Summary Section Skeleton */}
					<div className="lg:col-span-1">
						<CartSummarySkeleton />
					</div>
				</div>

				{/* Additional Information Skeleton */}
				<div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
					<div className="text-center p-6 bg-white rounded-lg border">
						<Skeleton className="w-12 h-12 rounded-full mx-auto mb-4" />
						<Skeleton className="h-5 w-24 mx-auto mb-2" />
						<Skeleton className="h-4 w-full" />
					</div>

					<div className="text-center p-6 bg-white rounded-lg border">
						<Skeleton className="w-12 h-12 rounded-full mx-auto mb-4" />
						<Skeleton className="h-5 w-20 mx-auto mb-2" />
						<Skeleton className="h-4 w-full" />
					</div>

					<div className="text-center p-6 bg-white rounded-lg border">
						<Skeleton className="w-12 h-12 rounded-full mx-auto mb-4" />
						<Skeleton className="h-5 w-28 mx-auto mb-2" />
						<Skeleton className="h-4 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
