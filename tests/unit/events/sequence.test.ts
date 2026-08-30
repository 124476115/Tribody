/**
 * FS-EVENTS-001 — logical sequence (AC-06, AC-07)
 *
 * AC-06: kernel-assigned logical sequences 1..n in processing order with no
 *        wall-clock authority; complete events with invalid sequences are
 *        rejected at validation.
 * AC-07: a draft carrying a caller-supplied `sequence` property is rejected at
 *        runtime with `invalid-event-shape` (Omit is compile-time only).
 */

import { describe, it, expect } from 'vitest';
import {
  asEventId,
  createEventTypeRegistry,
  createProcessingState,
  processEvent,
  validateEvent,
} from '@domain/events';
import type { DomainEvent, DraftEvent, Reducer } from '@domain/events';

const REG = createEventTypeRegistry(['scene.entered']);

function toCompleteEvent(sequence: number): DomainEvent {
  return {
    id: asEventId('occ_bad'),
    type: 'scene.entered',
    payload: null,
    sequence,
  } as unknown as DomainEvent;
}

describe('FS-EVENTS-001 sequence', () => {
  it('AC-06: givenSequentialDrafts_thenKernelAssignsOneTwoThree', () => {
    const reducer: Reducer<number> = (state) => state + 1;
    let proc = createProcessingState();
    let state = 0;
    const assigned: number[] = [];

    for (let i = 1; i <= 3; i += 1) {
      const draft: DraftEvent = {
        id: asEventId(`occ_seq_${i}`),
        type: 'scene.entered',
        payload: { i },
      };
      const result = processEvent(proc, state, draft, REG, reducer);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      proc = result.process;
      state = result.state;
      assigned.push(result.event.sequence);
    }

    expect(assigned).toEqual([1, 2, 3]);
    expect(proc.nextSequence).toBe(4);
  });

  it('AC-06: givenCompleteEventWithInvalidSequence_thenValidationRejects', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => validateEvent(toCompleteEvent(bad), REG)).toThrowError(
        expect.objectContaining({ code: 'invalid-sequence' })
      );
    }
  });

  it('AC-06: givenAcceptedEvent_thenEnvelopeCarriesNoClockFields', () => {
    const result = processEvent(
      createProcessingState(),
      0,
      { id: asEventId('occ_clock'), type: 'scene.entered', payload: null },
      REG,
      (state) => state
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.event).sort()).toEqual(['id', 'payload', 'sequence', 'type']);
  });

  it('AC-07: givenDraftInjectedWithSequenceField_thenRejectedAsInvalidEventShape', () => {
    const proc = createProcessingState();
    const smuggled = {
      id: asEventId('occ_smuggle'),
      type: 'scene.entered',
      payload: null,
      sequence: 99,
    } as unknown as DraftEvent;

    expect(() => processEvent(proc, 0, smuggled, REG, (state) => state)).toThrowError(
      expect.objectContaining({ code: 'invalid-event-shape' })
    );
  });

  it('AC-07: givenDraftWithExplicitlyUndefinedSequenceField_thenRejected', () => {
    const proc = createProcessingState();
    const smuggled = {
      id: asEventId('occ_smuggle2'),
      type: 'scene.entered',
      payload: null,
      sequence: undefined,
    } as unknown as DraftEvent;

    expect(() => processEvent(proc, 0, smuggled, REG, (state) => state)).toThrowError(
      expect.objectContaining({ code: 'invalid-event-shape' })
    );
  });
});
