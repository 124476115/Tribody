/**
 * FS-SAVE-001 — structural guards.
 *
 * - Generic JSON-safety walk (depth + dangerous keys) is forward-compatible:
 *   it must NOT reject unknown top-level fields before checksum verification.
 * - Version-specific payload guard is strict for its own version only and runs
 *   after checksum (asserted in pipeline.test.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_NESTING_DEPTH,
  assertJSONShape,
  assertHeaderShape,
  extractHeader,
  validatePayloadForVersion,
  SaveError,
} from '../../../src/domain/save';
import { basePayload, combinedRuntime } from '../../helpers/save-fixtures';
import type { SavePayload } from '../../../src/domain/save';

/** A v1-shaped payload (dialogue + quest only) for v1 guard tests. */
function v1Payload(rt: ReturnType<typeof combinedRuntime>): SavePayload {
  return {
    ...basePayload(),
    domain: { dialogue: rt.dialogue, quest: rt.quest } as unknown as SavePayload['domain'],
  };
}

describe('WO-013 guards', () => {
  it('rejects nesting deeper than MAX_NESTING_DEPTH', () => {
    const deep: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = deep;
    for (let i = 0; i < MAX_NESTING_DEPTH + 8; i++) {
      const next: Record<string, unknown> = {};
      cursor['n'] = next;
      cursor = next;
    }
    expect(() => assertJSONShape(deep)).toThrowError(SaveError);
    expect(() => assertJSONShape({ a: { b: 1 } })).not.toThrow();
  });

  it('rejects dangerous/smuggled keys', () => {
    const evily = JSON.parse(
      '{"__proto__": {"polluted": true}, "constructor": {"x": 1}}'
    ) as unknown;
    expect(() => assertJSONShape(evily)).toThrowError(SaveError);
  });

  it('rejects bare non-JSON values in any nested position', () => {
    expect(() => assertJSONShape({ a: [1, NaN] })).toThrowError(SaveError);
    expect(() => assertJSONShape({ a: { b: undefined } })).toThrowError(SaveError);
    expect(() => assertJSONShape({ a: new Date() })).toThrowError(SaveError);
  });

  it('header extraction reads a valid stable header and is forward-compatible with extra fields', () => {
    const raw = {
      schemaVersion: 9,
      contentVersion: '9.9.9',
      gameVersion: 'x',
      createdAt: 1,
      checksum: 'abc',
      payload: { whatever: true },
      futureFlag: { deep: [1, 2, 3] },
    };
    expect(() => assertJSONShape(raw)).not.toThrow();
    expect(() => assertHeaderShape(raw)).not.toThrow();
    const h = extractHeader(raw);
    expect(h.schemaVersion).toBe(9);
    expect(h.checksum).toBe('abc');
    expect(h.payload).toEqual({ whatever: true });
  });

  it('header validation rejects malformed headers without rejecting unknown payload keys', () => {
    expect(() =>
      assertHeaderShape({ checksum: 'x', payload: {}, schemaVersion: 'one' })
    ).toThrowError(SaveError);
    expect(() => assertHeaderShape({ payload: {}, schemaVersion: 1 })).toThrowError(SaveError); // no checksum
    expect(() => assertHeaderShape({ checksum: 'x', schemaVersion: 1 })).toThrowError(SaveError); // no payload
    expect(() =>
      assertHeaderShape({ checksum: 'x', payload: {}, schemaVersion: 1, extra: 1 })
    ).not.toThrow();
  });

  it('v1 payload guard accepts a full fixture payload and rejects unknown/malformed keys', () => {
    const payload = v1Payload(combinedRuntime());
    expect(() => validatePayloadForVersion(payload, 1)).not.toThrow();

    const unknownKey = { ...payload, worldFlags: {} } as typeof payload;
    expect(() => validatePayloadForVersion(unknownKey, 1)).toThrowError(SaveError);

    const badCheckpoint = { ...payload, checkpoint: { chapterId: 'x' } } as typeof payload;
    expect(() => validatePayloadForVersion(badCheckpoint, 1)).toThrowError(SaveError);

    const badPlaytime = { ...payload, playtimeMinutes: -1 } as typeof payload;
    expect(() => validatePayloadForVersion(badPlaytime, 1)).toThrowError(SaveError);
  });

  it('v1 payload guard validates dialogue session invariants (mode/pendingCheck)', () => {
    const rt = combinedRuntime();
    const payload = v1Payload(rt);
    payload.domain.dialogue = rt.dialogue;
    expect(() => validatePayloadForVersion(payload, 1)).not.toThrow();

    const broken = {
      ...payload,
      domain: {
        dialogue: { ...rt.dialogue, active: { ...rt.dialogue.active, mode: 'failed' } },
        quest: rt.quest,
      },
    };
    expect(() => validatePayloadForVersion(broken, 1)).toThrowError(SaveError);
  });

  it('v1 payload guard validates quest state invariants (status enum, objective state)', () => {
    const rt = combinedRuntime();
    const payload = v1Payload(rt);
    expect(() => validatePayloadForVersion(payload, 1)).not.toThrow();

    const badStatus = JSON.parse(JSON.stringify(rt.quest)) as typeof rt.quest;
    (badStatus.quests['q_ramp'] as { status: string }).status = 'activeish';
    expect(() =>
      validatePayloadForVersion(
        { ...payload, domain: { dialogue: rt.dialogue, quest: badStatus } },
        1
      )
    ).toThrowError(SaveError);
  });

  it('unknown key inside quest state is rejected by the strict v1 guard', () => {
    const rt = combinedRuntime();
    const payload = v1Payload(rt);
    const dialogue = rt.dialogue;
    const quest = JSON.parse(JSON.stringify(rt.quest));
    (quest['quests']['q_ramp'] as Record<string, unknown>)['intruder'] = true;
    expect(() =>
      validatePayloadForVersion({ ...payload, domain: { dialogue, quest } }, 1)
    ).toThrowError(SaveError);
  });
});
