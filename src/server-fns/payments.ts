import { createClient } from '@supabase/supabase-js';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// Cardano orchestration (server-side only — pulls in node:fs, signer, etc.)
import { type EscrowValue, prepareLockEscrowTx, submitLockEscrowTx } from '@/lib/cardano/escrow';
import { getScriptAddress } from '@/lib/cardano/escrow-policy';

// Server-fn helpers
import { insertEscrow } from '@/server-fns/escrows';
import { insertOrderEvent } from '@/server-fns/order-events';

// ---------------------------------------------------------------------------
// Supabase server client
// ---------------------------------------------------------------------------

function getServerSupabase() {
	const supabaseUrl = process.env.VITE_SUPABASE_URL;
	const secretKey = process.env.SUPABASE_SECRET_KEY;

	if (!supabaseUrl || !secretKey) {
		throw new Error('MISSING_ENV: VITE_SUPABASE_URL and SUPABASE_SECRET_KEY are required');
	}

	return createClient(supabaseUrl, secretKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

// ---------------------------------------------------------------------------
// Input schema for the new escrow-lock payment submission
// ---------------------------------------------------------------------------

const submitPaymentSchema = z.object({
	orderId: z.uuid('Invalid order ID format'),
	lockTxHash: z.string().min(64, 'Lock transaction hash is required'),
	lockOutputIndex: z.number().int().min(0),
	datumCbor: z.string().min(1, 'Datum CBOR is required'),
	scriptAddress: z.string().min(1, 'Script address is required'),
	buyerPkh: z.string().min(1, 'Buyer public key hash is required'),
	merchantPkh: z.string().min(1, 'Merchant public key hash is required'),
	paidAt: z.string().min(1, 'paidAt timestamp is required'),
	shipDeadline: z.string().min(1, 'shipDeadline timestamp is required'),
});

export type LockPaymentInput = z.infer<typeof submitPaymentSchema>;

// ---------------------------------------------------------------------------
// Internal: update order status directly in DB (no traceability side effects)
// ---------------------------------------------------------------------------

async function updateOrderStatusPaid(orderId: string, lockTxHash: string): Promise<void> {
	const supabase = getServerSupabase();

	const { error } = await supabase
		.from('orders')
		.update({ status: 'paid', cardano_tx_hash: lockTxHash } as Partial<Database.Order>)
		.eq('id', orderId);

	if (error) {
		throw new Error(`Failed to update order: ${error.message}`);
	}
}

// ---------------------------------------------------------------------------
// Core handler — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Handles the server-side escrow lock payment flow.
 *
 * Performs 3 DB operations in order (no on-chain traceability call):
 *   1. insertEscrow({..., status: 'pending'})
 *   2. UPDATE orders SET status='paid', cardano_tx_hash=lockTxHash
 *   3. insertOrderEvent({event_type: 'paid', tx_hash: lockTxHash, confirmed_at: NOW()})
 *
 * If any step throws, subsequent steps are not executed.
 */
export async function handleLockPayment(input: LockPaymentInput): Promise<{ success: true; lockTxHash: string }> {
	const {
		orderId,
		lockTxHash,
		lockOutputIndex,
		datumCbor,
		scriptAddress,
		buyerPkh,
		merchantPkh,
		paidAt,
		shipDeadline,
	} = input;

	// Step 1: Insert escrow row with status='pending'
	await insertEscrow({
		order_id: orderId,
		script_address: scriptAddress,
		utxo_tx_hash: lockTxHash,
		utxo_output_index: lockOutputIndex,
		status: 'pending',
		buyer_pkh: buyerPkh,
		merchant_pkh: merchantPkh,
		paid_at: paidAt,
		ship_deadline: shipDeadline,
		datum_cbor: datumCbor,
	});

	// Step 2: Update order status to 'paid' and set cardano_tx_hash
	await updateOrderStatusPaid(orderId, lockTxHash);

	// Step 3: Insert order_events row for the escrow lock
	await insertOrderEvent({
		order_id: orderId,
		event_type: 'paid',
		tx_hash: lockTxHash,
		confirmed_at: new Date().toISOString(),
		payload: {
			v: 1,
			event: 'paid',
			tx_hash: lockTxHash,
			lock_output_index: lockOutputIndex,
		},
	});

	return { success: true, lockTxHash };
}

// ---------------------------------------------------------------------------
// TanStack server function
// ---------------------------------------------------------------------------

export const submitPaymentServerFn = createServerFn({ method: 'POST' })
	.inputValidator(submitPaymentSchema)
	.handler(async ({ data }) => {
		return await handleLockPayment(data);
	});

// ---------------------------------------------------------------------------
// New escrow-lock flow: prepare (resolve tx) on server → sign in browser →
// submit (chain + DB) on server. Replaces the client-side submitLockEscrow
// path so the browser bundle no longer pulls in node:fs / Buffer / signer.
// ---------------------------------------------------------------------------

const adaValueSchema = z.object({
	kind: z.literal('ada'),
	lovelace: z.number().int().nonnegative(),
});

const tokenValueSchema = z.object({
	kind: z.literal('token'),
	policyId: z.string().min(1),
	assetName: z.string(),
	quantity: z.number().int().nonnegative(),
});

const escrowValueSchema = z.discriminatedUnion('kind', [adaValueSchema, tokenValueSchema]);

const prepareLockEscrowSchema = z.object({
	orderId: z.uuid('Invalid order ID format'),
	value: escrowValueSchema,
	buyerAddressHex: z.string().min(1, 'Buyer address (hex) is required'),
});

function toEscrowValue(value: z.infer<typeof escrowValueSchema>): EscrowValue {
	if (value.kind === 'ada') {
		return { lovelace: BigInt(value.lovelace) };
	}
	return {
		policyId: value.policyId,
		assetName: value.assetName,
		quantity: BigInt(value.quantity),
	};
}

export const prepareLockEscrowServerFn = createServerFn({ method: 'POST' })
	.inputValidator(prepareLockEscrowSchema)
	.handler(async ({ data }) => {
		const value = toEscrowValue(data.value);
		const prepared = await prepareLockEscrowTx(data.orderId, value, data.buyerAddressHex);
		const scriptAddress = getScriptAddress();

		return {
			envelope: { tx: prepared.envelope.tx, hash: prepared.envelope.hash },
			datumCbor: prepared.datumCbor,
			paidAt: prepared.paidAt,
			shipDeadline: prepared.shipDeadline,
			buyerPkh: prepared.buyerPkh,
			merchantPkh: prepared.merchantPkh,
			lockOutputIndex: prepared.lockOutputIndex,
			scriptAddress,
		};
	});

const submitLockEscrowSchema = z.object({
	orderId: z.uuid('Invalid order ID format'),
	envelope: z.object({
		tx: z.string().min(1),
		hash: z.string().min(64),
	}),
	witnessSetCborHex: z.string().min(1, 'Witness set CBOR is required'),
	datumCbor: z.string().min(1),
	scriptAddress: z.string().min(1),
	buyerPkh: z.string().min(1),
	merchantPkh: z.string().min(1),
	paidAt: z.string().min(1),
	shipDeadline: z.string().min(1),
	lockOutputIndex: z.number().int().min(0),
});

export const submitLockEscrowServerFn = createServerFn({ method: 'POST' })
	.inputValidator(submitLockEscrowSchema)
	.handler(async ({ data }) => {
		const { txHash } = await submitLockEscrowTx(
			{ tx: data.envelope.tx, hash: data.envelope.hash },
			data.witnessSetCborHex,
		);

		await handleLockPayment({
			orderId: data.orderId,
			lockTxHash: txHash,
			lockOutputIndex: data.lockOutputIndex,
			datumCbor: data.datumCbor,
			scriptAddress: data.scriptAddress,
			buyerPkh: data.buyerPkh,
			merchantPkh: data.merchantPkh,
			paidAt: data.paidAt,
			shipDeadline: data.shipDeadline,
		});

		return { success: true as const, lockTxHash: txHash };
	});
