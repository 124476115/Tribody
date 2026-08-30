/**
 * FS-EVENTS-001 — JSON serialization (AC-01, AC-02)
 *
 * AC-01: a valid DomainEvent survives JSON.stringify/JSON.parse losslessly;
 *        semantic equality does not depend on JSON object key insertion order.
 * AC-02: non-JSON payloads are rejected with `non-json-payload`; a shared
 *        (non-cyclic) object reference is accepted.
 */

import { describe, it, expect } from 'vitest';
import {
  asEventId,
  asSequence,
  assertJSONValue,
  createEventTypeRegistry,
  createProcessingState,
  processEvent,
  validateEvent,
} from '@domain/events';
import { DomainEventContractError } from '@domain/events';
import type { DomainEvent, DraftEvent, JSONValue } from '@domain/events';

const REG = createEventTypeRegistry(['scene.entered', 'test.event']);

function makeEvent(payload: JSONValue): DomainEvent {
  return {
    id: asEventId('occ_alpha'),
    type: 'scene.entered',
    payload,
    sequence: asSequence(7),
  };
}

function contractCode(call: () => void): string | undefined {
  try {
    call();
    return undefined;
  } catch (err) {
    if (err instanceof DomainEventContractError) return err.code;
    return `unexpected: ${String(err)}`;
  }
}

describe('FS-EVENTS-001 serialization', () => {
  it('AC-01: givenValidEvent_whenStringifyAndParse_thenContractIsPreserved', () => {
    const event = makeEvent({
      sceneId: 'sc_test_001',
      page: 3,
      tags: ['a', 'b'],
      isRed: true,
      meta: null,
      coords: [1, 2.5, -3],
    });

    const roundTripped: unknown = JSON.parse(JSON.stringify(event));
    validateEvent(roundTripped, REG);

    expect(roundTripped).toEqual(event);
    expect(Object.keys(event).sort()).toEqual(['id', 'payload', 'sequence', 'type']);
  });

  it('AC-01: givenEquivalentPayloadsInDifferentKeyOrder_thenSemanticallyEqual', () => {
    const parsedA = JSON.parse(JSON.stringify(makeEvent({ x: 1, y: 2, z: 3 })));
    const parsedB = JSON.parse(JSON.stringify(makeEvent({ z: 3, x: 1, y: 2 })));

    expect(parsedA).toEqual(parsedB);
  });

  it('AC-02: givenNonJsonPayloads_thenRejectedWithNonJsonPayload', () => {
    class Point {
      constructor(readonly x: number) {}
    }
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    const rejects: [string, () => void][] = [
      ['function', () => assertJSONValue(() => 1)],
      ['bigint', () => assertJSONValue(10n)],
      ['date instance', () => assertJSONValue(new Date())],
      ['class instance', () => assertJSONValue(new Point(1))],
      ['cyclic object', () => assertJSONValue(cyclic)],
      ['undefined value', () => assertJSONValue({ a: undefined })],
      ['NaN', () => assertJSONValue(NaN)],
      ['Infinity', () => assertJSONValue(Infinity)],
      ['top-level undefined', () => assertJSONValue(undefined)],
    ];

    for (const [label, call] of rejects) {
      expect(contractCode(call), label).toBe('non-json-payload');
    }
  });

  it('AC-02: givenSharedButAcyclicObjectReference_thenAccepted', () => {
    const shared = { v: 1 };

    expect(() => assertJSONValue({ a: shared, b: shared })).not.toThrow();
  });

  it('AC-02: givenCompleteEventWithDatePayload_thenValidationRejects', () => {
    const polluting: DomainEvent = {
      id: asEventId('occ_date'),
      type: 'scene.entered',
      payload: new Date() as unknown as JSONValue,
      sequence: asSequence(1),
    };

    expect(contractCode(() => validateEvent(polluting, REG))).toBe('non-json-payload');
  });

  it('AC-02: givenDraftWithDatePayload_thenProcessorRejects', () => {
    const proc = createProcessingState();
    const badDraft = {
      id: asEventId('occ_date2'),
      type: 'scene.entered',
      payload: new Date('2042-01-01T00:00:00Z'),
    } as unknown as DraftEvent;

    expect(contractCode(() => processEvent(proc, 0, badDraft, REG, (state) => state))).toBe(
      'non-json-payload'
    );
  });
});
