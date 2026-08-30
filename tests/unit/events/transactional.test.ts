/**
 * FS-EVENTS-001 — transactional processing (AC-09)
 *
 * AC-09: when the reducer throws, the error propagates unchanged, the
 *        EventProcessingState and domain state are untouched, and neither the
 *        id nor the sequence is consumed — the same draft stays processable.
 */

import { describe, it, expect } from 'vitest';
import {
  asEventId,
  createEventTypeRegistry,
  createProcessingState,
  processEvent,
} from '@domain/events';

const REG = createEventTypeRegistry(['test.event']);

describe('FS-EVENTS-001 transactional processing', () => {
  it('AC-09: givenReducerThrows_whenProcessingEvent_thenProcessingStateIsNotConsumed', () => {
    const boom = new Error('kernel-red');
    const proc = createProcessingState();
    const draft = { id: asEventId('occ_fail'), type: 'test.event', payload: null };

    expect(() =>
      processEvent(proc, 0, draft, REG, () => {
        throw boom;
      })
    ).toThrow('kernel-red');
    expect(proc.seenIds.size).toBe(0);
    expect(proc.nextSequence).toBe(1);

    const retry = processEvent(proc, 0, draft, REG, (state) => state + 1);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;

    expect(retry.event.sequence).toBe(1);
    expect(retry.process.nextSequence).toBe(2);
  });

  it('AC-09: givenMixedSession_whenLaterReducerThrows_thenOnlyFailedIdIsNotConsumed', () => {
    const okFirst = processEvent(
      createProcessingState(),
      0,
      { id: asEventId('occ_a'), type: 'test.event', payload: null },
      REG,
      (state) => state + 1
    );
    expect(okFirst.ok).toBe(true);
    if (!okFirst.ok) return;

    const boom = new Error('later-and-lower');
    const badSecond = { id: asEventId('occ_b'), type: 'test.event', payload: null };
    expect(() =>
      processEvent(okFirst.process, okFirst.state, badSecond, REG, () => {
        throw boom;
      })
    ).toThrow('later-and-lower');

    expect(okFirst.process.seenIds.has(asEventId('occ_a'))).toBe(true);
    expect(okFirst.process.seenIds.has(asEventId('occ_b'))).toBe(false);
    expect(okFirst.process.nextSequence).toBe(2);

    const retry = processEvent(
      okFirst.process,
      okFirst.state,
      badSecond,
      REG,
      (state) => state + 1
    );
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;

    expect(retry.event.sequence).toBe(2);
    expect(retry.process.nextSequence).toBe(3);
  });
});
