import type { BadgeKind } from './badges-catalog.js';
import { getCatalogEntry } from './badges-catalog.js';

/**
 * Derives the 30-byte asset name hex string for a badge token.
 *
 * Asset name format (per spec):
 *   <kind_id: 2 bytes> ++ <recipient_pkh: 28 bytes>
 *
 * Result is always 60 hex characters (30 bytes).
 *
 * @param kind - Badge kind identifier
 * @param recipientPkh - 28-byte (56 hex chars) recipient verification key hash
 * @returns 60-character lowercase hex string
 * @throws If recipientPkh is not exactly 56 hex characters
 */
export function deriveAssetName(kind: BadgeKind, recipientPkh: string): string {
	if (!/^[0-9a-fA-F]{56}$/.test(recipientPkh)) {
		throw new Error(`INVALID_RECIPIENT_PKH: must be exactly 56 hex characters, got ${recipientPkh.length}`);
	}

	const entry = getCatalogEntry(kind);
	const kindHex = entry.kind_id.toString(16).padStart(4, '0');
	return kindHex + recipientPkh.toLowerCase();
}
