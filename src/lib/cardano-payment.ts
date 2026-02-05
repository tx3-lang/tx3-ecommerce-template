import { Buffer } from 'buffer';

// Lib
import { decodeHexAddress } from '@/lib/cardano';
import { protocol } from '@/lib/tx3/protocol';
import { submitPaymentServerFn } from '@/server-fns/payments';

export interface PaymentResult {
	success: boolean;
	txHash?: string;
	error?: string;
	isTimeout?: boolean;
}

export interface PaymentRequest {
	amount: number; // in smallest unit of currency (lovelace for ADA, token units for tokens)
	recipient: string;
	policyId?: string; // null for ADA
	assetName?: string; // null for ADA
	metadata?: Record<string, unknown>;
}

export interface OrderPaymentInfo {
	id: string;
	amount: number;
	policyId?: string;
	assetName?: string;
}

export interface MultiCurrencyPaymentResult {
	success: boolean;
	completedOrders: Array<{
		orderId: string;
		txHash: string;
		policyId?: string;
		assetName?: string;
	}>;
	failedOrders: Array<{
		orderId: string;
		error: string;
		policyId?: string;
		assetName?: string;
	}>;
	allCompleted: boolean;
}

// Merchant address - this should be configurable via environment variables
const MERCHANT_ADDRESS = import.meta.env.VITE_MERCHANT_ADDRESS || '';

// Timeout configuration
// const CARDANO_PAYMENT_TIMEOUT = 60000; // 60 seconds = 3 Cardano blocks

export async function processCardanoPayment(wallet: CardanoWalletAPI, order: OrderPaymentInfo): Promise<PaymentResult> {
	try {
		// Determine payment type
		const isAdaPayment = !order.policyId && !order.assetName;

		const address = decodeHexAddress(await wallet.getChangeAddress());
		const commonProps = {
			buyer: address,
			merchant: MERCHANT_ADDRESS,
			quantity: order.amount,
		};

		const transactionInfo = isAdaPayment
			? await protocol.payWithAdaTx(commonProps)
			: await protocol.payWithTokensTx({
					...commonProps,
					// biome-ignore lint/style/noNonNullAssertion: Because we check isAdaPayment
					assetName: Buffer.from(order.assetName!, 'hex'),
					// biome-ignore lint/style/noNonNullAssertion: Because we check isAdaPayment
					tokenPolicy: Buffer.from(order.policyId!, 'hex'),
				});

		const userWitnessSet = await wallet.signTx(transactionInfo.tx, true);

		const submitResult = await submitPaymentServerFn({
			data: {
				tx_cbor_hex: transactionInfo.tx,
				witness_set_cbor_hex: userWitnessSet,
				tx_hash_hex: transactionInfo.hash,
			},
		});

		// TODO: Check transaction status on chain.

		if (!submitResult.success) {
			return {
				success: false,
				error: submitResult.error || 'Payment failed',
				isTimeout: submitResult.error === 'Payment timeout',
			};
		}

		return { success: true, txHash: submitResult.txHash || transactionInfo.hash };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Payment failed';
		return {
			success: false,
			error: errorMessage,
			isTimeout: errorMessage === 'Payment timeout',
		};
	}
}

/**
 * Process multiple payments sequentially for multi-currency orders
 * Each payment will be processed one at a time, with progress callback
 */
export async function processMultiCurrencyPayments(
	wallet: CardanoWalletAPI,
	orders: OrderPaymentInfo[],
	onProgress?: (orderId: string, status: 'processing' | 'completed' | 'failed', result?: PaymentResult) => void,
): Promise<MultiCurrencyPaymentResult> {
	const completedOrders: MultiCurrencyPaymentResult['completedOrders'] = [];
	const failedOrders: MultiCurrencyPaymentResult['failedOrders'] = [];

	// Process ADA payments first, then token payments
	const sortedOrders = [...orders].sort((a, b) => {
		const aIsAda = !a.policyId && !a.assetName;
		const bIsAda = !b.policyId && !b.assetName;
		if (aIsAda && !bIsAda) return -1;
		if (!aIsAda && bIsAda) return 1;
		return 0;
	});

	for (const order of sortedOrders) {
		// Notify processing start
		onProgress?.(order.id, 'processing');

		try {
			const result = await processCardanoPayment(wallet, order);

			if (result.success && result.txHash) {
				completedOrders.push({
					orderId: order.id,
					txHash: result.txHash,
					policyId: order.policyId,
					assetName: order.assetName,
				});
				onProgress?.(order.id, 'completed', result);
			} else {
				failedOrders.push({
					orderId: order.id,
					error: result.error || 'Payment failed',
					policyId: order.policyId,
					assetName: order.assetName,
				});
				onProgress?.(order.id, 'failed', result);
				// Stop processing on first failure
				break;
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Payment processing error';
			failedOrders.push({
				orderId: order.id,
				error: errorMessage,
				policyId: order.policyId,
				assetName: order.assetName,
			});
			onProgress?.(order.id, 'failed', { success: false, error: errorMessage });
			// Stop processing on first failure
			break;
		}
	}

	return {
		success: failedOrders.length === 0,
		completedOrders,
		failedOrders,
		allCompleted: completedOrders.length === orders.length,
	};
}

export async function validatePayment(
	_txHash: string,
	_expectedAmount: number,
	_recipient: string,
	_policyId?: string,
	_assetName?: string,
): Promise<boolean> {
	try {
		// This would integrate with a Cardano block explorer or node
		// to validate that the transaction exists and has the correct amount
		// For now, we'll simulate the validation

		// In a real implementation, you would:
		// 1. Query a Cardano node or block explorer API
		// 2. Verify the transaction exists
		// 3. Verify the amount matches
		// 4. Verify the recipient matches
		// 5. Verify the transaction is confirmed

		// Simulate API call delay
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Determine payment type for validation
		const isAdaPayment = !_policyId && !_assetName;
		const paymentType = isAdaPayment ? 'ADA' : 'token';
		const tokenInfo = isAdaPayment ? '' : ` (${_policyId}.${_assetName})`;

		// Simulate successful validation for demo purposes
		// In production, this would be actual blockchain validation
		console.log(
			`Validating ${paymentType} payment: tx=${_txHash}, amount=${_expectedAmount}, recipient=${_recipient}${tokenInfo}`,
		);
		return true;
	} catch (error) {
		console.error('Payment validation failed:', error);
		return false;
	}
}
