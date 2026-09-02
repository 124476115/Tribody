/**
 * Save System — canonical serialization (FS-SAVE-001)
 *
 * Pure TypeScript. Deterministic JSON: object keys are recursively sorted so
 * that equivalent values produce identical bytes under any construction order.
 * This is the on-the-wire format for checksums, export, and import.
 *
 * The serializer is strict about JSON safety: undefined/function/symbol/bigint
 * and non-finite numbers are rejected with a typed SaveError instead of the
 * silent `JSON.stringify` coercions.
 */
import { SaveError } from './errors';
import type { ChecksumBody, SaveRecord } from './types';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function toJsonValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new SaveError('corrupt-shape', `non-finite number at ${path}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    const out: JsonValue[] = [];
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === undefined) {
        throw new SaveError('corrupt-shape', `undefined in array at ${path}[${String(i)}]`);
      }
      out.push(toJsonValue(value[i], `${path}[${String(i)}]`));
    }
    return out;
  }
  if (typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = toJsonValue((value as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return out;
  }
  throw new SaveError('corrupt-shape', `unsupported value (${typeof value}) at ${path}`);
}

export function stringifyCanonical(value: unknown): string {
  return JSON.stringify(toJsonValue(value, '$'));
}

/**
 * Reads the FROZEN checksum body of a record: exactly
 * {schemaVersion, contentVersion, gameVersion, createdAt, payload}. Unknown
 * top-level record fields are never checksummed (forward compatibility).
 */
export function extractChecksumBody(record: SaveRecord): ChecksumBody {
  return {
    schemaVersion: record.schemaVersion,
    contentVersion: record.contentVersion,
    gameVersion: record.gameVersion,
    createdAt: record.createdAt,
    payload: record.payload,
  };
}
