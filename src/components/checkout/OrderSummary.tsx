import { IconAlertCircle } from '@tabler/icons-react';
import { brandConfig } from '@/config/brand';
import type { CartTotals } from '@/lib/cart-calculations';
import { formatPriceSync } from '@/lib/unified-formatter';

interface OrderSummaryProps {
	total: number;
	currencyBreakdown?: CartTotals['currencyBreakdown'] | null;
	showShippingAndTax?: boolean;
	itemsLength?: number;
	showMultiPaymentWarning?: boolean;
}

export function OrderSummary({
	total,
	currencyBreakdown,
	showShippingAndTax = true,
	itemsLength,
	showMultiPaymentWarning = false,
}: OrderSummaryProps) {
	const hasMultipleCurrencies = currencyBreakdown && Object.keys(currencyBreakdown).length > 1;
	const enableShipping = brandConfig.features.enableShipping;

	return (
		<div className="bg-white border rounded-lg p-6">
			<h3 className="font-semibold mb-4">Order Summary</h3>

			{/* Multi-currency warning */}
			{hasMultipleCurrencies && showMultiPaymentWarning && (
				<div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
					<div className="flex items-start space-x-2">
						<IconAlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
						<div>
							<p className="font-medium text-yellow-800">Multiple Transactions Required</p>
							<p className="text-sm text-yellow-700">
								Your cart contains items in {Object.keys(currencyBreakdown).length} different currencies. You will need
								to approve {Object.keys(currencyBreakdown).length} separate transactions in your wallet.
							</p>
						</div>
					</div>
				</div>
			)}

			<div className="space-y-3">
				{/* Currency Breakdown */}
				{currencyBreakdown && Object.keys(currencyBreakdown).length > 0 ? (
					<div className="space-y-4 mb-4">
						<h4 className="text-sm font-medium text-gray-700">Payment Details by Currency:</h4>
						{Object.entries(currencyBreakdown).map(([currencyKey, data]) => {
							const isAda = data.currencyType === 'ADA';

							return (
								<div key={currencyKey} className="mb-4 p-4 border border-gray-200 rounded-lg">
									<div className={`font-semibold ${isAda ? 'text-blue-600' : 'text-purple-600'}`}>
										Cardano Payment ({isAda ? '₳' : data.currencySymbol})
									</div>
									<div className="text-lg font-bold mt-2">
										{formatPriceSync(data.subtotal, data.policyId, data.assetName, { decimals: data.currencyDecimals })}
									</div>
									<div className="text-sm text-gray-600">
										{data.itemCount} {data.itemCount === 1 ? 'item' : 'items'} in this currency
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="flex justify-between text-sm">
						<span>Subtotal {itemsLength ? `(${itemsLength} items)` : ''}</span>
						<span>{formatPriceSync(total, null, null)}</span>
					</div>
				)}

				{showShippingAndTax && enableShipping && (
					<>
						<div className="flex justify-between text-sm">
							<span>Shipping</span>
							<span className="text-green-600">Free</span>
						</div>
						{/* <div className="flex justify-between text-sm">
							<span>Tax</span>
							<span>-</span>
						</div> */}
					</>
				)}

				{/* <div className="border-t pt-3">
					<div className="flex justify-between text-lg font-semibold">
						<span>Total</span>
						<span>{formatPriceSync(total, null, null)}</span>
					</div>
				</div> */}
			</div>
		</div>
	);
}
