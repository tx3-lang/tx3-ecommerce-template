import { IconAlertCircle, IconTruck } from '@tabler/icons-react';
import { memo } from 'react';

// Components
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export interface ShippingInfo {
	fullName: string;
	email: string;
	phone?: string;
	address: string;
	city: string;
	postalCode: string;
	country: string;
}

interface ShippingStepProps {
	shippingInfo: ShippingInfo;
	onShippingInfoChange: (info: ShippingInfo) => void;
	onProceed: () => void;
	onBack: () => void;
	isLoading: boolean;
	error?: string | null;
	idBase: string;
}

function ShippingStepComponent({
	shippingInfo,
	onShippingInfoChange,
	onProceed,
	onBack,
	isLoading,
	error,
	idBase,
}: ShippingStepProps) {
	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<IconTruck className="w-6 h-6 text-blue-600" />
				<h2 className="text-2xl font-bold">Shipping Information</h2>
			</div>

			{error && (
				<div className="p-4 bg-red-50 border border-red-200 rounded-lg">
					<div className="flex items-start space-x-2">
						<IconAlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
						<p className="text-red-800">{error}</p>
					</div>
				</div>
			)}

			<div className="bg-white border rounded-lg p-6">
				<form className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label htmlFor={`${idBase}-fullName`} className="block text-sm font-medium text-gray-700 mb-1">
								Full Name *
							</label>
							<input
								id={`${idBase}-fullName`}
								type="text"
								value={shippingInfo.fullName}
								onChange={e => onShippingInfoChange({ ...shippingInfo, fullName: e.target.value })}
								className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
							/>
						</div>
						<div>
							<label htmlFor={`${idBase}-email`} className="block text-sm font-medium text-gray-700 mb-1">
								Email *
							</label>
							<input
								id={`${idBase}-email`}
								type="email"
								value={shippingInfo.email}
								onChange={e => onShippingInfoChange({ ...shippingInfo, email: e.target.value })}
								className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
							/>
						</div>
					</div>

					<div>
						<label htmlFor={`${idBase}-phone`} className="block text-sm font-medium text-gray-700 mb-1">
							Phone (optional)
						</label>
						<input
							id={`${idBase}-phone`}
							type="tel"
							value={shippingInfo.phone}
							onChange={e => onShippingInfoChange({ ...shippingInfo, phone: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label htmlFor={`${idBase}-address`} className="block text-sm font-medium text-gray-700 mb-1">
							Address *
						</label>
						<input
							id={`${idBase}-address`}
							type="text"
							value={shippingInfo.address}
							onChange={e => onShippingInfoChange({ ...shippingInfo, address: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							required
						/>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div>
							<label htmlFor={`${idBase}-city`} className="block text-sm font-medium text-gray-700 mb-1">
								City *
							</label>
							<input
								id={`${idBase}-city`}
								type="text"
								value={shippingInfo.city}
								onChange={e => onShippingInfoChange({ ...shippingInfo, city: e.target.value })}
								className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
							/>
						</div>
						<div>
							<label htmlFor={`${idBase}-postalCode`} className="block text-sm font-medium text-gray-700 mb-1">
								Postal Code *
							</label>
							<input
								id={`${idBase}-postalCode`}
								type="text"
								value={shippingInfo.postalCode}
								onChange={e => onShippingInfoChange({ ...shippingInfo, postalCode: e.target.value })}
								className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
							/>
						</div>
						<div>
							<label htmlFor={`${idBase}-country`} className="block text-sm font-medium text-gray-700 mb-1">
								Country *
							</label>
							<input
								id={`${idBase}-country`}
								type="text"
								value={shippingInfo.country}
								onChange={e => onShippingInfoChange({ ...shippingInfo, country: e.target.value })}
								className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
							/>
						</div>
					</div>
				</form>
			</div>

			<div className="flex justify-between">
				<Button variant="outline" onClick={onBack} disabled={isLoading}>
					Back to Review
				</Button>
				<Button onClick={onProceed} disabled={isLoading}>
					{isLoading ? <Spinner /> : null}
					Proceed to Payment
				</Button>
			</div>
		</div>
	);
}

export const ShippingStep = memo(ShippingStepComponent);
