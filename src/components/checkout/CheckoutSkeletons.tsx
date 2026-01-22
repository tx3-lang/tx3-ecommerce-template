/** biome-ignore-all lint/suspicious/noArrayIndexKey: Is just skeleton file. */
import { Skeleton } from '@/components/ui/skeleton';

interface CheckoutStepSkeletonProps {
	title?: string;
	icon?: React.ReactNode;
	itemCount?: number;
}

export function CheckoutStepSkeleton({ title, icon, itemCount = 2 }: CheckoutStepSkeletonProps) {
	return (
		<div className="space-y-6">
			{title && (
				<div className="flex items-center gap-3">
					{icon || <Skeleton className="w-6 h-6" />}
					<Skeleton className="h-8 w-48" />
				</div>
			)}

			{/* Order Items Skeleton */}
			<div className="bg-white border rounded-lg p-6">
				<Skeleton className="h-6 w-32 mb-4" />
				<div className="space-y-4">
					{Array.from({ length: itemCount }).map((_, i) => (
						<div key={`skeleton-item-${i}`} className="flex items-center space-x-4 p-4 border rounded">
							<Skeleton className="w-16 h-16 rounded" />
							<div className="flex-1 space-y-2">
								<Skeleton className="h-4 w-3/4" />
								<Skeleton className="h-3 w-1/2" />
							</div>
							<div className="text-right space-y-2">
								<Skeleton className="h-4 w-20" />
								<Skeleton className="h-3 w-16" />
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Order Summary Skeleton */}
			<div className="bg-white border rounded-lg p-6">
				<Skeleton className="h-6 w-32 mb-4" />
				<div className="space-y-3">
					<div className="flex justify-between">
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-4 w-20" />
					</div>
					<div className="flex justify-between">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-4 w-12" />
					</div>
					<div className="flex justify-between">
						<Skeleton className="h-4 w-12" />
						<Skeleton className="h-4 w-8" />
					</div>
					<hr className="my-3" />
					<div className="flex justify-between">
						<Skeleton className="h-5 w-12" />
						<Skeleton className="h-5 w-20" />
					</div>
				</div>
			</div>

			{/* Action Buttons Skeleton */}
			<div className="flex justify-between">
				<Skeleton className="h-10 w-24" />
				<Skeleton className="h-10 w-40" />
			</div>
		</div>
	);
}

interface StepIndicatorSkeletonProps {
	stepCount?: number;
}

export function StepIndicatorSkeleton({ stepCount = 4 }: StepIndicatorSkeletonProps) {
	return (
		<div className="flex items-center justify-between mb-8">
			{Array.from({ length: stepCount }).map((_, i) => (
				<div key={`skeleton-step-${i}`} className="flex items-center">
					<Skeleton className="w-10 h-10 rounded-full" />
					{i < stepCount - 1 && <Skeleton className="flex-1 h-0.5 mx-2" />}
				</div>
			))}
		</div>
	);
}
