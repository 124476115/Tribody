/**
 * FS-EVENTS-001 — opaque EventId (AC-03)
 *
 * AC-03: EventId is opaque and structurally validated; two occurrences with the
 *        same EventType and different ids are both accepted.
 */

import { describe, it, expect } from 'vitest';
import {
  asEventId,
  createEventTypeRegistry,
  createProcessingState,
  isValidEventId,
  processEvent,
} from '@domain/events';
import { DomainEventContractError } from '@domain/events';
import type { DraftEvent } from '@domain/events';

const REG = createEventTypeRegistry(['scene.entered']);

const reducer = (state: number): number => state + 1;

const INVALID_IDS: string[] = [
  '',
  'contains space',
  'contains\ttab',
  'contains\n newline',
  '中文字符id',
  '\u0001control',
  'x'.repeat(129),
];

describe('FS-EVENTS-001 EventId', () => {
  it('AC-03: givenValidPrintableAsciiId_thenAccepted', () => {
    expect(isValidEventId('ok_id_123')).toBe(true);
    expect(isValidEventId('x'.repeat(128))).toBe(true);
    expect(asEventId('ok_id_123')).toBe('ok_id_123');
  });

  it('AC-03: givenMalformedIds_thenRejectedAsInvalidEventId', () => {
    for (const bad of INVALID_IDS) {
      expect(isValidEventId(bad), JSON.stringify(bad)).toBe(false);
    }
    for (const bad of INVALID_IDS) {
      expect(() => asEventId(bad)).toThrow(DomainEventContractError);
    }
    expect(() => asEventId('')).toThrowError(expect.objectContaining({ code: 'invalid-event-id' }));
  });

  it('AC-03: givenDraftWithMalformedId_thenProcessorRejects', () => {
    const proc = createProcessingState();
    const badDraft = { id: '', type: 'scene.entered', payload: null } as unknown as DraftEvent;

    expect(() => processEvent(proc, 0, badDraft, REG, reducer)).toThrowError(
      expect.objectContaining({ code: 'invalid-event-id' })
    );
  });

  it('AC-03: givenDistinctIdsWithSameEventType_thenBothAcceptedWithAscendingSequences', () => {
    const proc = createProcessingState();
    const first = processEvent(
      proc,
      0,
      { id: asEventId('occ_one'), type: 'scene.entered', payload: null },
      REG,
      reducer
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(first.event.sequence).toBe(1);
    expect(first.state).toBe(1);

    const second = processEvent(
      first.process,
      first.state,
      { id: asEventId('occ_two'), type: 'scene.entered', payload: null },
      REG,
      reducer
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.event.sequence).toBe(2);
    expect(second.state).toBe(2);
    expect(second.process.nextSequence).toBe(3);
  });
});
