/**
 * FS-EVENTS-001 — duplicate id handling (AC-04)
 *
 * AC-04: processing the same EventId twice returns duplicate-id without
 *        invoking the reducer a second time; dedup memory is session-scoped.
 */

import { describe, it, expect } from 'vitest';
import {
  asEventId,
  createEventTypeRegistry,
  createProcessingState,
  hasProcessed,
  processEvent,
} from '@domain/events';

const REG = createEventTypeRegistry(['scene.entered']);
const DRAFT = { id: asEventId('occ_dup'), type: 'scene.entered', payload: null };

describe('FS-EVENTS-001 duplicates', () => {
  it('AC-04: givenDuplicateEventId_thenDuplicateResultAndReducerSkipped', () => {
    let reducerCalls = 0;
    const reducer = (state: number): number => {
      reducerCalls += 1;
      return state + 1;
    };

    const proc = createProcessingState();
    const first = processEvent(proc, 0, DRAFT, REG, reducer);
    expect(first.ok).toBe(true);
    expect(reducerCalls).toBe(1);
    if (!first.ok) return;

    expect(first.process.nextSequence).toBe(2);
    expect(first.process.seenIds.size).toBe(1);
    expect(hasProcessed(first.process, asEventId('occ_dup'))).toBe(true);
    expect(hasProcessed(first.process, asEventId('occ_other'))).toBe(false);

    const second = processEvent(first.process, first.state, DRAFT, REG, reducer);
    expect(second.ok).toBe(false);
    expect(reducerCalls).toBe(1);
    if (second.ok) return;

    expect(second.reason).toBe('duplicate-id');
    expect(second.eventId).toBe('occ_dup');
    expect(first.process.nextSequence).toBe(2);
    expect(first.process.seenIds.size).toBe(1);
  });

  it('AC-04: givenFreshSession_thenPreviouslySeenIdIsAcceptedAgain', () => {
    const fresh = processEvent(createProcessingState(), 0, DRAFT, REG, (state) => state + 1);
    expect(fresh.ok).toBe(true);
  });
});
