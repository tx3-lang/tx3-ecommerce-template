import { TransactionWitnessSet } from '@emurgo/cardano-serialization-lib-nodejs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { createServerFn } from '@tanstack/react-start';
import type { SubmitWitness } from 'tx3-sdk/trp';
import { z } from 'zod';
import { protocol } from '@/lib/tx3/protocol';

const submitPaymentSchema = z.object({
	tx_cbor_hex: z.string().min(1, 'Transaction CBOR is required'),
	witness_set_cbor_hex: z.string().min(1, 'Witness set CBOR is required'),
	tx_hash_hex: z.string().min(64, 'Transaction hash is required'),
});

function hexToBytes(hex: string): Uint8Array {
	return Buffer.from(hex, 'hex');
}

function signTxWithMerchant(txHash: string): SubmitWitness[] {
	const privateKey = process.env.CARDANO_MERCHANT_SKEY;
	if (!privateKey) {
		throw new Error('Merchant private key is not set in environment variables');
	}

	const txHashBytes = hexToBytes(txHash);
	const privateKeyBytes = hexToBytes(privateKey);

	const signature = ed25519.sign(txHashBytes, privateKeyBytes);
	const publicKey = ed25519.getPublicKey(privateKeyBytes);

	return [
		{
			type: 'vkey',
			key: {
				content: Buffer.from(publicKey).toString('hex'),
				encoding: 'hex',
			},
			signature: {
				content: Buffer.from(signature).toString('hex'),
				encoding: 'hex',
			},
		},
	];
}

function witnessesFromWitnessSet(witnessSet: TransactionWitnessSet): SubmitWitness[] {
	const vkeys = witnessSet.vkeys();
	if (!vkeys) return [];

	const out: SubmitWitness[] = [];
	for (let i = 0; i < vkeys.len(); i += 1) {
		const w = vkeys.get(i);
		out.push({
			type: 'vkey',
			key: {
				content: w.vkey().public_key().to_hex(),
				encoding: 'hex',
			},
			signature: {
				content: w.signature().to_hex(),
				encoding: 'hex',
			},
		});
	}
	return out;
}

export const submitPaymentServerFn = createServerFn({ method: 'POST' })
	.inputValidator(submitPaymentSchema)
	.handler(async ({ data }) => {
		try {
			const { witness_set_cbor_hex, tx_cbor_hex, tx_hash_hex } = data;

			const merchantWitnesses = signTxWithMerchant(tx_hash_hex);
			const walletWitnessSet = TransactionWitnessSet.from_bytes(hexToBytes(witness_set_cbor_hex));
			const walletWitnesses = witnessesFromWitnessSet(walletWitnessSet);

			await protocol.submit({
				tx: {
					content: tx_cbor_hex,
					encoding: 'hex',
				},
				witnesses: [...merchantWitnesses, ...walletWitnesses],
			});

			return {
				success: true,
				txHash: tx_hash_hex,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Payment submission failed';
			return {
				success: false,
				error: errorMessage,
			};
		}
	});
