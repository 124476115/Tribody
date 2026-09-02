/**
 * FS-PROG-001 AC-10 — a single XP award crossing multiple thresholds must
 * produce a deterministic, per-step sequence of LevelUpResult that maps to one
 * `progression.level-up` event per discrete level gained.
 */
import { describe, it, expect } from 'vitest';
import {
  createProgressionState,
  activatePc,
  applyXp,
  xpRequiredToReach,
  type XpSourceFact,
} from '../../../src/domain/progression';

function fact(n: number): XpSourceFact {
  return { pcId: 'pc_wang', occurrenceId: 'occ-big', xp: n };
}

describe('FS-PROG-001 multi-level grants', () => {
  it('crosses 2 thresholds in one award and emits 2 level-ups in ascending order', () => {
    // Reach level 2 needs 100, level 3 needs 300. Award 300 -> level 3, two steps.
    const state = activatePc(createProgressionState(), 'pc_wang');
    const result = applyXp(state, fact(xpRequiredToReach(3)));
    expect(result.levelUps).toEqual([
      { pcId: 'pc_wang', from: 1, to: 2 },
      { pcId: 'pc_wang', from: 2, to: 3 },
    ]);
    expect(result.state.pcs['pc_wang']?.level).toBe(3);
  });

  it('crosses 3 thresholds in one award and emits 3 level-ups ascending', () => {
    const state = activatePc(createProgressionState(), 'pc_wang');
    // Award enough to jump from level 1 straight to level 4 (needs 600).
    const result = applyXp(state, fact(xpRequiredToReach(4)));
    expect(result.levelUps).toEqual([
      { pcId: 'pc_wang', from: 1, to: 2 },
      { pcId: 'pc_wang', from: 2, to: 3 },
      { pcId: 'pc_wang', from: 3, to: 4 },
    ]);
    expect(result.state.pcs['pc_wang']?.level).toBe(4);
  });

  it('award partially beyond a threshold emits exactly one level-up', () => {
    const state = activatePc(createProgressionState(), 'pc_wang');
    const result = applyXp(state, fact(250)); // enough for level 2, not level 3
    expect(result.levelUps).toEqual([{ pcId: 'pc_wang', from: 1, to: 2 }]);
    expect(result.state.pcs['pc_wang']?.level).toBe(2);
  });
});
