/**
 * FS-PROG-001 AC-08 — integration: XP source fact → accrual → level-up event
 * through the kernel. Quest-side consumption of `progression.level-up` is
 * intentionally deferred (WO-020 decision): WO-020 owns PRODUCTION of the
 * event. This test proves the full production path: a Gate-1-style fact is
 * reduced into XP, the runtime returns the deterministic level-up sequence, and
 * the application maps each step to a `progression.level-up` kernel event that
 * the generic WO-002 processor accepts and sequences.
 */
import { describe, it, expect } from 'vitest';
import {
  createProgressionState,
  activatePc,
  applyXp,
  xpRequiredToReach,
  PROGRESSION_LEVEL_UP_EVENT_TYPE,
  type XpSourceFact,
} from '../../src/domain/progression';
import {
  asEventId,
  createEventTypeRegistry,
  createProcessingState,
  processEvent,
  type EventProcessingState,
} from '../../src/domain/events';

describe('FS-PROG-001 integration — XP source fact → accrual → level-up event', () => {
  it('AC-08: a quest-resolution fact accrues XP, crosses a threshold, and emits a level-up event', () => {
    // A Gate-1 quest-resolution fact produces an XP source with a stable
    // occurrence identity (e.g. the quest+objective completion id).
    const sourceFact: XpSourceFact = {
      pcId: 'pc_wang',
      occurrenceId: 'q_ch04_ramp:obj_b_resolved',
      xp: xpRequiredToReach(2), // 100
    };

    const progression = activatePc(createProgressionState(), 'pc_wang');
    const result = applyXp(progression, sourceFact);
    expect(result.credited).toBe(true);
    expect(result.state.pcs['pc_wang']?.level).toBe(2);
    expect(result.levelUps).toHaveLength(1);

    // Application emits one progression.level-up per discrete level-gained step.
    const registry = createEventTypeRegistry([PROGRESSION_LEVEL_UP_EVENT_TYPE]);
    let process: EventProcessingState = createProcessingState();
    const sequenced: unknown[] = [];
    for (const lvl of result.levelUps) {
      const draft = {
        id: asEventId(`lv-${lvl.pcId}-${lvl.from}-${lvl.to}`),
        type: PROGRESSION_LEVEL_UP_EVENT_TYPE,
        payload: { pcId: lvl.pcId, from: lvl.from, to: lvl.to },
      };
      const p = processEvent(process, null, draft, registry, () => null);
      expect(p.ok).toBe(true);
      if (p.ok) {
        sequenced.push(p.event);
        process = p.process;
      }
    }
    expect(sequenced).toHaveLength(1);
    expect(sequenced[0]).toMatchObject({
      type: 'progression.level-up',
      payload: { pcId: 'pc_wang', from: 1, to: 2 },
    });
  });

  it('AC-08: replaying the same source fact accrues no further XP and emits no level-up', () => {
    const sourceFact: XpSourceFact = {
      pcId: 'pc_wang',
      occurrenceId: 'q_ch04_ramp:obj_b_resolved',
      xp: xpRequiredToReach(2),
    };
    let progression = activatePc(createProgressionState(), 'pc_wang');
    progression = applyXp(progression, sourceFact).state;
    const replay = applyXp(progression, sourceFact);
    expect(replay.credited).toBe(false);
    expect(replay.grantedXp).toBe(0);
    expect(replay.levelUps).toEqual([]);
    expect(replay.state).toEqual(progression);
  });
});
