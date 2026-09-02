/**
 * FS-PROG-001 AC-02 — level-up is a first-class, producible event. The
 * application maps each LevelUpResult to a `progression.level-up` domain event.
 * The event type is registered in the generic WO-002 kernel registry.
 */
import { describe, it, expect } from 'vitest';
import {
  createProgressionState,
  activatePc,
  applyXp,
  xpRequiredToReach,
  PROGRESSION_LEVEL_UP_EVENT_TYPE,
  type LevelUpEmission,
} from '../../../src/domain/progression';
import { createEventTypeRegistry, hasEventType, asEventId } from '../../../src/domain/events';
import {
  createProcessingState,
  processEvent,
  type EventProcessingState,
} from '../../../src/domain/events';

/**
 * The application-side emission: converts a LevelUpResult into a ready-to-process
 * progression.level-up draft event. (Mirrors the contract in FS-PROG-001.)
 */
function emitLevelUp(levelUp: { pcId: string; from: number; to: number }): LevelUpEmission {
  return {
    id: asEventId(`lv-${levelUp.pcId}-${levelUp.from}-${levelUp.to}`),
    type: PROGRESSION_LEVEL_UP_EVENT_TYPE,
    payload: { pcId: levelUp.pcId, from: levelUp.from, to: levelUp.to },
  };
}

describe('FS-PROG-001 level-up event emission', () => {
  it('AC-02: a level-up maps to a registered progression.level-up event', () => {
    const state = activatePc(createProgressionState(), 'pc_wang');
    const result = applyXp(state, {
      pcId: 'pc_wang',
      occurrenceId: 'occ-1',
      xp: xpRequiredToReach(2),
    });
    expect(result.levelUps).toHaveLength(1);
    const levelUp = result.levelUps[0];
    expect(levelUp).toBeDefined();
    if (levelUp === undefined) throw new Error('expected one level-up');
    const draft = emitLevelUp(levelUp);
    expect(draft.type).toBe('progression.level-up');
    expect(draft.payload).toEqual({ pcId: 'pc_wang', from: 1, to: 2 });
  });

  it('the event type is registered in the generic kernel registry', () => {
    const registry = createEventTypeRegistry(['progression.level-up']);
    expect(hasEventType(registry, 'progression.level-up')).toBe(true);
  });

  it('a mapped level-up event processes through the kernel as an acknowledged type', () => {
    const registry = createEventTypeRegistry(['progression.level-up']);
    let process: EventProcessingState = createProcessingState();
    const reducerEvents: string[] = [];
    const draft = emitLevelUp({ pcId: 'pc_wang', from: 1, to: 2 });
    const processed = processEvent(process, null, draft, registry, (_s, e) => {
      reducerEvents.push(e.type);
      return null;
    });
    expect(processed.ok).toBe(true);
    if (processed.ok) {
      expect(processed.event.type).toBe('progression.level-up');
      expect(processed.event.sequence).toBe(1);
      process = processed.process;
    }
    expect(reducerEvents).toEqual(['progression.level-up']);
  });
});
