// Lib
import { type EscrowValue, submitLockEscrow } from '@/lib/cardano/escrow';
import { getScriptAddress } from '@/lib/cardano/escrow-policy';
import { submitPaymentServerFn } from '@/server-fns/payments';

export interface PaymentResult {
	success: boolean;
	txHash?: string;
	lockOutputIndex?: number;
	datumCbor?: string;
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
	// Token min-ADA (only relevant for token payments)
	minAda?: number;
}

export interface MultiCurrencyPaymentResult {
	success: boolean;
	completedOrders: Array<{
		orderId: string;
		txHash: string;
		lockOutputIndex: number;
		datumCbor: string;
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

export async function processCardanoPayment(wallet: CardanoWalletAPI, order: OrderPaymentInfo): Promise<PaymentResult> {
	try {
		// Build the escrow value shape expected by submitLockEscrow
		const isAdaPayment = !order.policyId && !order.assetName;

		let value: EscrowValue;
		if (isAdaPayment) {
			value = { lovelace: BigInt(order.amount) };
		} else {
			value = {
				lovelace: BigInt(order.minAda ?? 2_000_000), // 2 ADA default min-ADA
				// biome-ignore lint/style/noNonNullAssertion: guard checked above
				policyId: order.policyId!,
				// biome-ignore lint/style/noNonNullAssertion: guard checked above
				assetName: order.assetName!,
				quantity: BigInt(order.amount),
			};
		}

		// Submit the lock tx — returns { lockTxHash, lockOutputIndex, datumCbor,
		//   paidAt, shipDeadline, buyerPkh, merchantPkh }
		const lockResult = await submitLockEscrow(order.id, value, wallet);

		// Derive the script address from the compiled Plutus validator (aiken/plutus.json).
		// This is authoritative — no env var needed.
		const scriptAddress = getScriptAddress();

		// Convert epoch-ms timestamps from lockResult to ISO strings for the DB.
		const paidAt = new Date(lockResult.paidAt).toISOString();
		const shipDeadline = new Date(lockResult.shipDeadline).toISOString();

		await submitPaymentServerFn({
			data: {
				orderId: order.id,
				lockTxHash: lockResult.lockTxHash,
				lockOutputIndex: lockResult.lockOutputIndex,
				datumCbor: lockResult.datumCbor,
				scriptAddress,
				buyerPkh: lockResult.buyerPkh,
				merchantPkh: lockResult.merchantPkh,
				paidAt,
				shipDeadline,
			},
		});

		return {
			success: true,
			txHash: lockResult.lockTxHash,
			lockOutputIndex: lockResult.lockOutputIndex,
			datumCbor: lockResult.datumCbor,
		};
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
					lockOutputIndex: result.lockOutputIndex ?? 0,
					datumCbor: result.datumCbor ?? '',
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
