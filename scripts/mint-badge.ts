/**
 * CLI script: mint-badge
 *
 * Usage:
 *   pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind <buyer-first-purchase|seller-first-delivery>
 *
 * What it does:
 *   1. Validates CLI args and converts kind hyphens → underscores.
 *   2. Loads the order + escrow from DB; verifies escrow.status === 'released'.
 *   3. Resolves the recipient (buyer or merchant) from the catalog entry.
 *   4. Checks eligibility via the catalog entry's eligibility function.
 *   5. Checks that the badge has not already been issued to this recipient.
 *   6. Calls submitMintBadge to put the badge on chain.
 *   7. On success: persists an issued_badges row.
 *   8. On chain failure: exits non-zero without touching issued_badges.
 *   9. Prints the tx hash and a cExplorer link (preview only) to stdout.
 *
 * Operation order:
 *   validate → escrow check → eligibility → already-issued → mint → persist
 *   A chain failure before step 7 leaves issued_badges clean.
 */

import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

import type { BadgeKind } from '@/lib/cardano/badges-catalog';
import { getCatalogEntry } from '@/lib/cardano/badges-catalog';
import { getPolicyId } from '@/lib/cardano/badges-policy';
import { submitMintBadge } from '@/lib/cardano/badges';
import { getNetworkConfig } from '@/lib/cardano/network';
import { insertIssuedBadge } from '@/server-fns/issued-badges';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MintBadgeResult {
	txHash: string;
	explorerUrl?: string;
}

const VALID_KINDS = new Set(['buyer-first-purchase', 'seller-first-delivery']);

// ---------------------------------------------------------------------------
// Helpers
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

function buildExplorerUrl(profile: string, txHash: string): string | undefined {
	if (profile === 'preview') {
		return `https://preview.cexplorer.io/tx/${txHash}`;
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// main — exported for testability; entry point calls main(process.argv.slice(2))
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<MintBadgeResult> {
	// -----------------------------------------------------------------------
	// Step 0: Parse CLI args
	// -----------------------------------------------------------------------
	const { values } = parseArgs({
		args,
		options: {
			'order-id': { type: 'string' },
			kind: { type: 'string' },
		},
		strict: true,
	});

	const orderId = values['order-id'];
	const rawKind = values['kind'];

	if (!orderId) {
		throw new Error('MISSING_ARG: --order-id is required');
	}
	if (!rawKind) {
		throw new Error('MISSING_ARG: --kind is required');
	}
	if (!VALID_KINDS.has(rawKind)) {
		throw new Error(
			`INVALID_KIND: --kind must be "buyer-first-purchase" or "seller-first-delivery", got "${rawKind}"`,
		);
	}

	const kind = rawKind.replace(/-/g, '_') as BadgeKind;

	// -----------------------------------------------------------------------
	// Step 1: Connect to Supabase
	// -----------------------------------------------------------------------
	const supabase = getServerSupabase();

	// -----------------------------------------------------------------------
	// Step 2: Load order + escrow
	// -----------------------------------------------------------------------
	const { data: orderRow, error: orderError } = await supabase
		.from('orders')
		.select('wallet_address')
		.eq('id', orderId)
		.single();

	if (orderError || !orderRow) {
		throw new Error(
			`ORDER_NOT_FOUND: order ${orderId} not found — ${orderError?.message ?? 'no data returned'}`,
		);
	}

	const { data: escrowRow, error: escrowError } = await supabase
		.from('escrows')
		.select('status,buyer_pkh,merchant_pkh')
		.eq('order_id', orderId)
		.single();

	if (escrowError || !escrowRow) {
		throw new Error(
			`ORDER_NOT_FOUND: escrow for order ${orderId} not found — ${escrowError?.message ?? 'no data returned'}`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 3: Escrow status check
	// -----------------------------------------------------------------------
	if (escrowRow.status !== 'released') {
		throw new Error(
			`ORDER_NOT_ELIGIBLE: escrow status is "${escrowRow.status}", expected "released"`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 4: Resolve recipient
	// -----------------------------------------------------------------------
	const entry = getCatalogEntry(kind);

	let recipientPkh: string;
	let recipientAddress: string;

	if (entry.recipient_role === 'buyer') {
		recipientPkh = escrowRow.buyer_pkh;
		recipientAddress = orderRow.wallet_address;
	} else {
		recipientPkh = escrowRow.merchant_pkh;
		recipientAddress = process.env.MERCHANT_ADDRESS ?? '';
		if (!recipientAddress) {
			throw new Error('MISSING_ENV: MERCHANT_ADDRESS is required for merchant badges');
		}
	}

	// -----------------------------------------------------------------------
	// Step 5: Eligibility check
	// -----------------------------------------------------------------------
	const eligible = await entry.eligibility(orderId, supabase);

	if (!eligible) {
		throw new Error(`ELIGIBILITY_NOT_MET: badge "${kind}" for order ${orderId}`);
	}

	// -----------------------------------------------------------------------
	// Step 6: Already issued check
	// -----------------------------------------------------------------------
	const { data: existingBadge } = await supabase
		.from('issued_badges')
		.select('mint_tx_hash')
		.eq('kind', kind)
		.eq('recipient_pkh', recipientPkh)
		.maybeSingle();

	if (existingBadge) {
		throw new Error(
			`BADGE_ALREADY_ISSUED: kind=${kind}, recipient_pkh=${recipientPkh}, mint_tx_hash=${existingBadge.mint_tx_hash}`,
		);
	}

	// -----------------------------------------------------------------------
	// Step 7: Mint badge on chain
	// -----------------------------------------------------------------------
	const mintResult = await submitMintBadge(kind, recipientPkh, recipientAddress, orderId);

	// -----------------------------------------------------------------------
	// Step 8: Persist issued_badges row
	// -----------------------------------------------------------------------
	const policyId = getPolicyId();

	await insertIssuedBadge({
		kind,
		recipient_pkh: recipientPkh,
		recipient_address: recipientAddress,
		triggering_order_id: orderId,
		policy_id: policyId,
		asset_name_hex: mintResult.assetName,
		mint_tx_hash: mintResult.txHash,
		metadata: mintResult.metadata as Record<string, Database.JsonValue>,
	});

	// -----------------------------------------------------------------------
	// Step 9: Build and return result
	// -----------------------------------------------------------------------
	const { profile } = getNetworkConfig();
	const explorerUrl = buildExplorerUrl(profile, mintResult.txHash);

	return { txHash: mintResult.txHash, explorerUrl };
}

// ---------------------------------------------------------------------------
// CLI entry point — only runs when this file is executed directly
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noConsole: intentional CLI output
async function run() {
	try {
		const result = await main(process.argv.slice(2));

		const orderId =
			process.argv.find((_, i) => process.argv[i - 1] === '--order-id') ?? 'unknown';
		// biome-ignore lint/suspicious/noConsole: intentional CLI output
		console.log(`[mint-badge] order=${orderId} tx=${result.txHash}`);
		if (result.explorerUrl) {
			// biome-ignore lint/suspicious/noConsole: intentional CLI output
			console.log(`Explorer: ${result.explorerUrl}`);
		}
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: intentional CLI stderr
		console.error('[mint-badge] ERROR:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

// Detect direct execution (tsx runs the file directly, not via import)
const isDirectRun =
	process.argv[1]?.endsWith('mint-badge.ts') || process.argv[1]?.endsWith('mint-badge.js');

if (isDirectRun) {
	void run();
}
