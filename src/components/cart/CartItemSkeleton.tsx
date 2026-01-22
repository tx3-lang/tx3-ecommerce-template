// Components
import { Skeleton } from '@/components/ui/skeleton';

export function CartItemSkeleton() {
	return (
		<div className="flex gap-4 p-4 border rounded-lg bg-white">
			{/* Product Image Skeleton */}
			<Skeleton className="w-20 h-20 rounded-lg" />

			{/* Product Details Skeleton */}
			<div className="flex-1">
				<div className="flex justify-between items-start mb-2">
					<div className="flex-1">
						<Skeleton className="h-6 w-3/4 mb-2" />
						<Skeleton className="h-4 w-full mb-1" />
						<Skeleton className="h-4 w-2/3" />
					</div>
					<Skeleton className="h-8 w-8" />
				</div>

				{/* Stock Status Skeleton */}
				<Skeleton className="h-5 w-24 mb-3" />

				{/* Price and Quantity Controls Skeleton */}
				<div className="flex items-center justify-between">
					<div>
						<Skeleton className="h-4 w-20 mb-1" />
						<Skeleton className="h-6 w-16" />
					</div>

					<Skeleton className="h-10 w-24" />
				</div>
			</div>
		</div>
	);
}
