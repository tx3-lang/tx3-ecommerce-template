import { IconAlertCircle, IconCheck, IconClock, IconCreditCard, IconLoader, IconX } from '@tabler/icons-react';
import { memo } from 'react';
// Components
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
// Config
import { brandConfig } from '@/config/brand';

// Hooks
import { useCart } from '@/hooks/use-cart';

// Lib
import { formatPriceSync } from '@/lib/unified-formatter';

export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CurrencyPaymentStatus {
	currencyKey: string;
	currencySymbol: string;
	amount: number;
	status: TransactionStatus;
	txHash?: string;
	error?: string;
	policyId?: string | null;
	assetName?: string | null;
	decimals: number;
}

interface PaymentStepProps {
	total: number;
	isConnected: boolean;
	isLoading: boolean;
	availableWallets: string[];
	onWalletConnect: (walletName: string) => void;
	onPayment: () => void;
	onBack: () => void;
	error?: string | null;
	paymentStatuses?: CurrencyPaymentStatus[];
}

function getStatusIcon(status: TransactionStatus) {
	switch (status) {
		case 'completed':
			return <IconCheck className="w-5 h-5 text-green-600" />;
		case 'processing':
			return <IconLoader className="w-5 h-5 text-blue-600 animate-spin" />;
		case 'failed':
			return <IconX className="w-5 h-5 text-red-600" />;
		// case 'pending':
		default:
			return <IconClock className="w-5 h-5 text-gray-400" />;
	}
}

function getStatusColor(status: TransactionStatus) {
	switch (status) {
		case 'completed':
			return 'border-green-200 bg-green-50';
		case 'processing':
			return 'border-blue-200 bg-blue-50';
		case 'failed':
			return 'border-red-200 bg-red-50';
		// case 'pending':
		default:
			return 'border-gray-200 bg-gray-50';
	}
}

function PaymentStepComponent({
	isConnected,
	isLoading,
	availableWallets,
	onWalletConnect,
	onPayment,
	onBack,
	error,
	paymentStatuses = [],
}: PaymentStepProps) {
	const { currencyBreakdown } = useCart();
	const hasMultiplePayments = currencyBreakdown && Object.keys(currencyBreakdown).length > 1;
	const hasStartedPayments = paymentStatuses.length > 0;

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

			{/* Step 1: Wallet Connection */}
			<div className="bg-white border rounded-lg p-6">
				<h3 className="font-semibold mb-4">Step 1: Connect Your Wallet</h3>
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
								{availableWallets.length === 0 ? (
									<p className="text-sm text-gray-500">No Cardano wallets found. Please install a wallet extension.</p>
								) : (
									availableWallets.map(walletKey => {
										const walletInfo = window.cardano?.[walletKey];
										if (!walletInfo) return null;
										return (
											<Button
												key={walletKey}
												onClick={() => onWalletConnect(walletKey)}
												disabled={isLoading}
												className="w-full"
												variant="outline"
											>
												{isLoading ? <Spinner /> : null}
												Connect {walletInfo.name || walletKey}{' '}
												<img
													src={walletInfo.icon}
													className="inline h-full py-1"
													alt={`Icon wallet ${walletInfo.name}`}
												/>
											</Button>
										);
									})
								)}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Step 2: Payment Breakdown and Progress */}
			{isConnected && (
				<>
					<div className="bg-white border rounded-lg p-6">
						<h3 className="font-semibold mb-4">Step 2: Payment Details</h3>

						{hasMultiplePayments && !hasStartedPayments && (
							<div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
								<div className="flex items-start space-x-2">
									<IconAlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
									<div>
										<p className="font-medium text-yellow-800">Multiple Transactions Required</p>
										<p className="text-sm text-yellow-700">
											Your cart contains items in {Object.keys(currencyBreakdown).length} different currencies. You will
											need to approve {Object.keys(currencyBreakdown).length} separate transactions in your wallet.
										</p>
									</div>
								</div>
							</div>
						)}

						<div className="space-y-4">
							{currencyBreakdown &&
								Object.entries(currencyBreakdown).map(([currencyKey, data]) => {
									const paymentStatus = paymentStatuses.find(ps => ps.currencyKey === currencyKey);
									const status = paymentStatus?.status || 'pending';
									const isAda = data.currencyType === 'ADA';

									return (
										<div key={currencyKey} className={`p-4 border rounded-lg ${getStatusColor(status)}`}>
											<div className="flex items-start justify-between">
												<div className="flex-1">
													<div className="flex items-center gap-2">
														{getStatusIcon(status)}
														<div className={`font-semibold ${isAda ? 'text-blue-600' : 'text-purple-600'}`}>
															{isAda ? 'ADA Payment' : `${data.currencySymbol} Token Payment`}
														</div>
													</div>
													<div className="text-lg font-bold mt-2">
														{formatPriceSync(data.subtotal, data.policyId, data.assetName, {
															decimals: data.currencyDecimals,
														})}
													</div>
													<div className="text-sm text-gray-600">
														{data.itemCount} {data.itemCount === 1 ? 'item' : 'items'}
													</div>

													{paymentStatus?.error && (
														<div className="mt-2 text-sm text-red-600">{paymentStatus.error}</div>
													)}

													{paymentStatus?.txHash && (
														<div className="mt-2 text-xs text-gray-500">
															<span className="font-medium">Tx Hash:</span> {paymentStatus.txHash}...
														</div>
													)}
												</div>

												<div className="text-right">
													{status === 'completed' && (
														<span className="text-sm font-medium text-green-600">Completed</span>
													)}
													{status === 'processing' && (
														<span className="text-sm font-medium text-blue-600">Processing...</span>
													)}
													{status === 'failed' && <span className="text-sm font-medium text-red-600">Failed</span>}
													{status === 'pending' && <span className="text-sm font-medium text-gray-400">Pending</span>}
												</div>
											</div>
										</div>
									);
								})}
						</div>
					</div>

					{!hasStartedPayments && (
						<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
							<div className="flex items-start space-x-2">
								<IconAlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
								<div>
									<p className="font-medium text-blue-800">Ready to Pay</p>
									<p className="text-sm text-blue-700">
										{hasMultiplePayments
											? 'Click "Start Payments" to begin. You will need to approve each transaction in your wallet (60 seconds per transaction).'
											: 'Click "Pay Now" to complete your payment. You have 60 seconds to approve the transaction in your wallet.'}
									</p>
								</div>
							</div>
						</div>
					)}
				</>
			)}

			<div className="flex justify-between">
				<Button variant="outline" onClick={onBack} disabled={isLoading}>
					{brandConfig.features.enableShipping ? 'Back to Shipping' : 'Back to Review'}
				</Button>
				{isConnected && !hasStartedPayments && (
					<Button onClick={onPayment} disabled={isLoading}>
						{isLoading ? <Spinner /> : null}
						Start Payments
					</Button>
				)}
			</div>
		</div>
	);
}

export const PaymentStep = memo(PaymentStepComponent);
