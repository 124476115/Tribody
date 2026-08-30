/**
 * FS-EVENTS-001 — public API integration round-trip (AC-11)
 *
 * Ships through the @domain barrel to prove the public module-graph surface
 * works end-to-end: process -> serialize -> parse -> validate -> apply to
 * equivalent state -> same result. Also proves @domain/index and
 * @domain/events share one module instance.
 */

import { describe, it, expect } from 'vitest';
import {
  asEventId,
  createEventTypeRegistry,
  createProcessingState,
  processEvent,
  validateEvent,
} from '@domain/index';
import { applyReducer, DomainEventContractError } from '@domain/events';
import type { DomainEvent, Reducer } from '@domain/index';

const REG = createEventTypeRegistry(['scene.entered']);

const reducer: Reducer<{ visits: number }> = (state, event) =>
  event.type === 'scene.entered' ? { ...state, visits: state.visits + 1 } : state;

describe('FS-EVENTS-001 integration round-trip', () => {
  it('AC-11: givenPublicApi_thenAcceptSerializeValidateApplyReproduceSameResult', () => {
    let proc = createProcessingState();
    const accepted: DomainEvent[] = [];

    for (const id of ['occ_1', 'occ_2']) {
      const result = processEvent(
        proc,
        { visits: 0 },
        { id: asEventId(id), type: 'scene.entered', payload: { sceneId: 'sc_ch01_01_redcoast' } },
        REG,
        reducer
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      proc = result.process;
      accepted.push(result.event);
    }

    expect(accepted.map((e) => e.sequence)).toEqual([1, 2]);

    const serialized = accepted.map((e) => JSON.stringify(e));
    const hydrated: DomainEvent[] = serialized.map((raw) => {
      const parsed: unknown = JSON.parse(raw);
      validateEvent(parsed, REG);
      return parsed;
    });

    expect(hydrated).toEqual(accepted);

    const rebuilt = hydrated.reduce((state, event) => applyReducer(state, event, reducer), {
      visits: 0,
    });
    expect(rebuilt).toEqual({ visits: 2 });
  });

  it('AC-11: givenErrorFromValidation_thenInstanceMatchesTheEventsModule', () => {
    const command = { type: 'scene/exit', exitId: 'east' };
    let caught: unknown;

    try {
      validateEvent(command, REG);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(DomainEventContractError);
  });
});
