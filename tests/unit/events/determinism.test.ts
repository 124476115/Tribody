/**
 * FS-EVENTS-001 — determinism and non-mutation (AC-08)
 *
 * AC-08: equivalent inputs produce equivalent outputs; repeated application of
 *        the same reducer+event yields the same result; neither the caller's
 *        processing state nor domain state is mutated. (Reducers are not
 *        required to be idempotent by the kernel.)
 */

import { describe, it, expect } from 'vitest';
import {
  applyReducer,
  asEventId,
  asSequence,
  createEventTypeRegistry,
  createProcessingState,
  processEvent,
} from '@domain/events';
import type { DomainEvent, Reducer } from '@domain/events';

const REG = createEventTypeRegistry(['scene.entered']);

const EVENT: DomainEvent = {
  id: asEventId('occ_det'),
  type: 'scene.entered',
  payload: { inc: 3 },
  sequence: asSequence(1),
};

const reducer: Reducer<{ total: number; log: number[] }> = (state, event) =>
  event.type === 'scene.entered'
    ? {
        ...state,
        total: state.total + (event.payload as { inc: number }).inc,
        log: [...state.log, event.sequence],
      }
    : state;

describe('FS-EVENTS-001 determinism', () => {
  it('AC-08: givenEquivalentInputs_thenReducerProducesEquivalentOutputs', () => {
    const outA = applyReducer({ total: 0, log: [1] }, EVENT, reducer);
    const outB = applyReducer({ total: 0, log: [1] }, EVENT, reducer);

    expect(outA).toEqual(outB);
    expect(outA).toEqual({ total: 3, log: [1, 1] });
  });

  it('AC-08: givenSameStateAndEvent_thenRepeatedApplicationIsIdentical', () => {
    const first = applyReducer({ total: 0, log: [] }, EVENT, reducer);
    const second = applyReducer({ total: 0, log: [] }, EVENT, reducer);

    expect(first).toEqual(second);
  });

  it('AC-08: givenProcessSuccess_thenCallerStateAndProcessingStateAreNotMutated', () => {
    const state = { total: 0, log: [] };
    const stateSnapshot = JSON.stringify(state);
    const proc = createProcessingState();

    const result = processEvent(
      proc,
      state,
      { id: asEventId('occ_m'), type: 'scene.entered', payload: { inc: 1 } },
      REG,
      reducer
    );

    expect(JSON.stringify(state)).toBe(stateSnapshot);
    expect(proc.seenIds.size).toBe(0);
    expect(proc.nextSequence).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.process.seenIds.has(asEventId('occ_m'))).toBe(true);
    expect(result.process.nextSequence).toBe(2);
  });
});
