import { decode } from 'cbor-x';

export interface VkeyWitness {
	vkey: Uint8Array;
	signature: Uint8Array;
}

type CborMapLike = Map<number, unknown> | Record<string, unknown>;

function getMapValue(mapLike: CborMapLike, key: number): unknown {
	if (mapLike instanceof Map) {
		return mapLike.get(key);
	}
	return mapLike[String(key)];
}

function asMapLike(value: unknown): CborMapLike {
	if (value instanceof Map) return value;
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	throw new Error('Witness set CBOR must be a map');
}

export function decodeWitnessSetVkeys(witnessSetCbor: Uint8Array): VkeyWitness[] {
	const decoded = decode(witnessSetCbor) as unknown;
	const mapLike = asMapLike(decoded);

	const vkeyValue = getMapValue(mapLike, 0);
	if (!vkeyValue) return [];
	if (!Array.isArray(vkeyValue)) {
		throw new Error('Witness set vkeys must be an array');
	}

	const out: VkeyWitness[] = [];
	for (const entry of vkeyValue) {
		if (!Array.isArray(entry) || entry.length < 2) {
			throw new Error('Vkey witness must be an array of [vkey, signature]');
		}
		const vkey = entry[0];
		const signature = entry[1];
		if (!(vkey instanceof Uint8Array) || !(signature instanceof Uint8Array)) {
			throw new Error('Vkey witness entries must be byte strings');
		}
		out.push({ vkey, signature });
	}

	return out;
}
