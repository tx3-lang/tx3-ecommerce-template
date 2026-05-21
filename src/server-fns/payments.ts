import { createServerFn } from '@tanstack/react-start';
import { Buffer } from 'buffer';
import type { TxWitness } from 'tx3-sdk/trp';
import { TrpClient } from 'tx3-sdk/trp';
import { z } from 'zod';

// Lib
import { getNetworkConfig } from '@/lib/cardano/network';
import { getMerchantSigner } from '@/lib/cardano/signer';
import { decodeWitnessSetVkeys } from '@/lib/cbor-witness';

const submitPaymentSchema = z.object({
	tx_cbor_hex: z.string().min(1, 'Transaction CBOR is required'),
	witness_set_cbor_hex: z.string().min(1, 'Witness set CBOR is required'),
	tx_hash_hex: z.string().min(64, 'Transaction hash is required'),
});

function hexToBytes(hex: string): Uint8Array {
	return Buffer.from(hex, 'hex');
}

function bytesToHex(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('hex');
}

function witnessesFromWitnessSetCbor(witnessSetCborHex: string): TxWitness[] {
	const vkeyWitnesses = decodeWitnessSetVkeys(hexToBytes(witnessSetCborHex));
	return vkeyWitnesses.map(witness => ({
		type: 'vkey',
		key: {
			content: bytesToHex(witness.vkey),
			contentType: 'hex',
		},
		signature: {
			content: bytesToHex(witness.signature),
			contentType: 'hex',
		},
	}));
}

export const submitPaymentServerFn = createServerFn({ method: 'POST' })
	.inputValidator(submitPaymentSchema)
	.handler(async ({ data }) => {
		try {
			const { witness_set_cbor_hex, tx_cbor_hex, tx_hash_hex } = data;

			const merchantWitnesses = getMerchantSigner().sign(tx_hash_hex);
			const walletWitnesses = witnessesFromWitnessSetCbor(witness_set_cbor_hex);

			const { trpEndpoint } = getNetworkConfig();
			const trpClient = new TrpClient({ endpoint: trpEndpoint });
			await trpClient.submit({
				tx: {
					content: tx_cbor_hex,
					contentType: 'hex',
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
