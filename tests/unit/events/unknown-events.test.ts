/**
 * FS-EVENTS-001 — unknown event type policy (AC-05)
 *
 * AC-05: kernel guarantee — an unregistered EventType is rejected BEFORE the
 *        reducer runs; reducer contract — a registered type the reducer does
 *        not handle results in the reducer being invoked and returning the
 *        state unchanged (this is the reducer's choice, not kernel dispatch).
 */

import { describe, it, expect } from 'vitest';
import {
  asEventId,
  createEventTypeRegistry,
  createProcessingState,
  processEvent,
} from '@domain/events';
import { DomainEventContractError } from '@domain/events';
import type { Reducer } from '@domain/events';

const REG = createEventTypeRegistry(['scene.entered', 'npc.talked']);

describe('FS-EVENTS-001 unknown events', () => {
  it('AC-05: givenUnregisteredType_thenThrowsBeforeTheReducerRuns', () => {
    let reducerCalls = 0;
    const reducer = (state: number): number => {
      reducerCalls += 1;
      return state + 1;
    };
    const proc = createProcessingState();
    const draft = { id: asEventId('occ_x'), type: 'quest.started', payload: { questId: 'q_1' } };

    expect(() => processEvent(proc, 0, draft, REG, reducer)).toThrow(DomainEventContractError);
    expect(() => processEvent(proc, 0, draft, REG, reducer)).toThrowError(
      expect.objectContaining({ code: 'unknown-event-type' })
    );

    expect(reducerCalls).toBe(0);
    expect(proc.seenIds.size).toBe(0);
    expect(proc.nextSequence).toBe(1);
  });

  it('AC-05: givenRegisteredButUnhandledType_thenReducerRunsAndStateIsUnchanged', () => {
    let reducerCalls = 0;
    const reducer: Reducer<{ visited: number }> = (state, event) => {
      reducerCalls += 1;
      if (event.type === 'scene.entered') return { ...state, visited: state.visited + 1 };
      return state; // registered-but-unhandled: the reducer may return unchanged
    };

    const proc = createProcessingState();
    const input = { visited: 0 };
    const result = processEvent(
      proc,
      input,
      { id: asEventId('occ_1'), type: 'npc.talked', payload: { npcId: 'npc_1' } },
      REG,
      reducer
    );
    expect(result.ok).toBe(true);
    expect(reducerCalls).toBe(1);
    if (!result.ok) return;

    expect(result.state).toBe(input);
    expect(input).toEqual({ visited: 0 });
  });
});
