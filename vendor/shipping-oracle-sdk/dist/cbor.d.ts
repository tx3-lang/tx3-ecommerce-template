/**
 * Canonical CBOR encoder for OracleData.
 *
 * Produces byte-for-byte identical output to:
 *   - Rust: pallas `minicbor::to_vec` of `PlutusData::Constr { tag: 121, fields: Indef([...]) }`
 *   - Aiken: `builtin.serialise_data(OracleData)`
 *
 * Hand-rolled — no CBOR library dependency.  Encoding rules:
 *   - Constr tag 121: 0xd8 0x79
 *   - Indefinite-length array: 0x9f … 0xff
 *   - Byte string (major 2): shortest-form header, then raw bytes
 *   - Unsigned integer (major 0): shortest-form (inline / 1B / 2B / 4B / 8B)
 *   - Negative integer (major 1): over (-1 - n), same length rules
 *
 * Pinned test vectors live in:
 *   sdk/typescript/test/cbor.test.ts
 *   backend/tests/cbor_alignment.rs
 *   onchain/lib/cbor_alignment_tests.ak
 */
import type { OracleData } from "./types.js";
/**
 * Encode `OracleData` as canonical PlutusData CBOR.
 *
 * Structure: `Constr(121, [bytes(carrier_hash), bytes(tracking_number_hash),
 *                          bytes(status_utf8), int(timestamp)])`
 *
 * Uses an indefinite-length array for the constructor fields, matching the
 * encoding produced by Aiken's `builtin.serialise_data` and pallas minicbor.
 */
export declare function encodeOracleDataCbor(data: OracleData): Uint8Array;
