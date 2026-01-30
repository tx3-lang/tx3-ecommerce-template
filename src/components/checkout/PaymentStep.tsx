import { IconAlertCircle, IconCheck, IconCreditCard } from '@tabler/icons-react';
import { memo } from 'react';

// Components
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Hooks
import { useCart } from '@/hooks/use-cart';

// Lib
import { formatPriceSync } from '@/lib/unified-formatter';

interface PaymentStepProps {
	total: number;
	isConnected: boolean;
	isLoading: boolean;
	onWalletConnect: (walletName: string) => void;
	onPayment: () => void;
	onBack: () => void;
	error?: string | null;
}

function PaymentStepComponent({
	total,
	isConnected,
	isLoading,
	onWalletConnect,
	onPayment,
	onBack,
	error,
}: PaymentStepProps) {
	const { currencyBreakdown } = useCart();
	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<IconCreditCard className="w-6 h-6 text-blue-600" />
				<h2 className="text-2xl font-bold">Payment</h2>
			</div>

			{error && (
				<div className="p-4 bg-red-50 border border-red-200 rounded-lg">
					<div className="flex items-start space-x-2">
						<IconAlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
						<p className="text-red-800">{error}</p>
					</div>
				</div>
			)}

			{/* Order Summary */}
			<div className="bg-white border rounded-lg p-6">
				<h3 className="font-semibold mb-4">Order Summary</h3>
				<div className="space-y-3">
					{/* Currency Breakdown */}
					{currencyBreakdown && Object.keys(currencyBreakdown).length > 0 ? (
						<div className="space-y-4">
							<h4 className="text-sm font-medium text-gray-700">Payment Details by Currency:</h4>
							{Object.entries(currencyBreakdown).map(([currencyKey, data]) => {
								const isAda = data.currencyType === 'ADA';

								return (
									<div key={currencyKey} className="mb-4 p-4 border border-gray-200 rounded-lg">
										<div className={`font-semibold ${isAda ? 'text-blue-600' : 'text-purple-600'}`}>
											Cardano Payment ({isAda ? '₳' : data.currencySymbol})
										</div>
										<div className="text-lg font-bold mt-2">
											{formatPriceSync(data.subtotal, data.policyId, data.assetName)}
										</div>
										<div className="text-sm text-gray-600">
											{data.itemCount} {data.itemCount === 1 ? 'item' : 'items'} in this currency
										</div>
									</div>
								);
							})}

							{/* Total */}
							<div className="border-t pt-3">
								<div className="flex justify-between text-lg font-semibold">
									<span>Total</span>
									<span>{formatPriceSync(total, null, null)}</span>
								</div>
							</div>
						</div>
					) : (
						<div className="flex justify-between text-sm">
							<span>Total Amount</span>
							<span className="font-semibold">{formatPriceSync(total, null, null)}</span>
						</div>
					)}
				</div>
			</div>

			{/* Wallet Connection */}
			<div className="bg-white border rounded-lg p-6">
				<h3 className="font-semibold mb-4">Wallet Connection</h3>
				<div className="space-y-4">
					{isConnected ? (
						<div className="p-4 bg-green-50 border border-green-200 rounded-lg">
							<div className="flex items-center space-x-2">
								<IconCheck className="w-5 h-5 text-green-600" />
								<span className="text-green-800 font-medium">Wallet Connected</span>
							</div>
						</div>
					) : (
						<div className="space-y-3">
							<p className="text-gray-600">Connect your Cardano wallet to proceed with payment</p>
							<div className="space-y-2">
								<Button onClick={() => onWalletConnect('eternl')} disabled={isLoading} className="w-full">
									{isLoading ? <Spinner /> : null}
									Connect Eternl
								</Button>
								<Button
									onClick={() => onWalletConnect('nami')}
									disabled={isLoading}
									variant="outline"
									className="w-full"
								>
									{isLoading ? <Spinner /> : null}
									Connect Nami
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>

			{isConnected && (
				<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
					<div className="flex items-start space-x-2">
						<IconAlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
						<div>
							<p className="font-medium text-yellow-800">Payment Required</p>
							<p className="text-sm text-yellow-700">
								Please approve the payment request in your wallet. You have 60 seconds to complete the transaction.
							</p>
						</div>
					</div>
				</div>
			)}

			<div className="flex justify-between">
				<Button variant="outline" onClick={onBack} disabled={isLoading}>
					Back to Shipping
				</Button>
				{isConnected && (
					<Button onClick={onPayment} disabled={isLoading}>
						{isLoading ? <Spinner /> : null}
						Pay {formatPriceSync(total, null, null)}
					</Button>
				)}
			</div>
		</div>
	);
}

export const PaymentStep = memo(PaymentStepComponent);
