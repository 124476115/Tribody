/**
 * FS-SAVE-001 — canonical serialization contract (determinism + checksum body).
 *
 * stringifyCanonical must be deterministic (sorted keys, in-order arrays, no
 * whitespace) and total over JSON-safe values; extractChecksumBody must read
 * exactly the frozen finalized-body fields and tolerate unknown future fields.
 */
import { describe, it, expect } from 'vitest';
import { extractChecksumBody, stringifyCanonical, SaveError } from '../../../src/domain/save';
import { basePayload, recordFor } from '../../helpers/save-fixtures';

describe('WO-013 canonical serialization', () => {
  it('produces stable bytes for equivalent objects (sorted keys, no whitespace)', () => {
    const a = { b: [1, 2], a: { x: 'q', y: null }, z: true };
    const b = { z: true, a: { y: null, x: 'q' }, b: [1, 2] };
    expect(stringifyCanonical(a)).toBe(stringifyCanonical(b));
    expect(stringifyCanonical(a)).not.toContain(' ');
    expect(stringifyCanonical(a)).not.toContain('\n');
  });

  it('round-trips payload determinism: equivalent runtime states serialize identically', () => {
    const p1 = basePayload();
    const p2 = JSON.parse(JSON.stringify(p1)) as typeof p1;
    expect(stringifyCanonical(p1)).toBe(stringifyCanonical(p2));
  });

  it('rejects non-JSON values (undefined, non-finite, functions) with a typed SaveError', () => {
    expect(() => stringifyCanonical({ a: undefined })).toThrowError(SaveError);
    expect(() => stringifyCanonical({ a: NaN })).toThrowError(SaveError);
    expect(() => stringifyCanonical({ a: () => 1 })).toThrowError(SaveError);
  });

  it('extractChecksumBody reads exactly the frozen body and ignores unknown top-level fields', () => {
    const record = recordFor(basePayload());
    const body = extractChecksumBody(record);
    expect(Object.keys(body).sort()).toEqual(
      ['contentVersion', 'createdAt', 'gameVersion', 'payload', 'schemaVersion'].sort()
    );
    expect(body.schemaVersion).toBe(record.schemaVersion);
    expect(body.contentVersion).toBe(record.contentVersion);

    const futureish = { ...record, legacyField: 'irrelevant', checksum: 'x' };
    const futureBody = extractChecksumBody(futureish);
    expect(futureBody).toEqual({ ...record, checksum: undefined } as unknown);
    expect((futureBody as { checksum?: string }).checksum).toBeUndefined();
  });

  it('canonical bytes are independent of key insertion order for nested payloads', () => {
    const r1 = recordFor(basePayload());
    const r2 = JSON.parse(JSON.stringify(r1)) as typeof r1;
    delete (r2 as { createdAt?: number }).createdAt;
    (r2 as { createdAt: number }).createdAt = 1_700_000_000_000;
    // createdAt re-inserted after other fields; equivalent record reconstructed in a different key order.
    const rebuilt = {
      payload: r2.payload,
      checksum: r2.checksum,
      contentVersion: r2.contentVersion,
      gameVersion: r2.gameVersion,
      schemaVersion: r2.schemaVersion,
      createdAt: r2.createdAt,
    } as typeof r2;
    expect(stringifyCanonical(extractChecksumBody(r1))).toBe(
      stringifyCanonical(extractChecksumBody(rebuilt))
    );
  });
});
