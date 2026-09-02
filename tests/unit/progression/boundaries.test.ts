/**
 * FS-PROG-001 AC-03 / AC-09 — monotonic, exact XP/level transitions with
 * explicit boundary cases: 0 XP, level 1, exact threshold, and the level-20
 * cap (clamped behavior).
 */
import { describe, it, expect } from 'vitest';
import {
  createProgressionState,
  activatePc,
  applyXp,
  xpRequiredToReach,
  levelForXp,
  MIN_LEVEL,
  MAX_LEVEL,
  MAX_XP,
  type XpSourceFact,
} from '../../../src/domain/progression';

function fact(n: number, occurrenceId = `occ-${n}`): XpSourceFact {
  return { pcId: 'pc_wang', occurrenceId, xp: n };
}

describe('FS-PROG-001 threshold boundaries', () => {
  it('starts at level 1 with 0 XP', () => {
    const state = activatePc(createProgressionState(), 'pc_wang');
    const pc = state.pcs['pc_wang'];
    expect(pc?.level).toBe(MIN_LEVEL);
    expect(pc?.xp).toBe(0);
  });

  it('AC-03: reaching the exact threshold for level 2 yields level 2', () => {
    let state = activatePc(createProgressionState(), 'pc_wang');
    const need = xpRequiredToReach(2);
    expect(need).toBe(100);
    state = applyXp(state, fact(need)).state;
    expect(state.pcs['pc_wang']?.level).toBe(2);
    expect(state.pcs['pc_wang']?.xp).toBe(100);
  });

  it('AC-03: XP below the first threshold stays level 1', () => {
    let state = activatePc(createProgressionState(), 'pc_wang');
    state = applyXp(state, fact(99)).state;
    expect(state.pcs['pc_wang']?.level).toBe(1);
    expect(state.pcs['pc_wang']?.xp).toBe(99);
  });

  it('AC-03: level increases monotonically with XP', () => {
    let state = activatePc(createProgressionState(), 'pc_wang');
    let lastLevel = 1;
    for (const amt of [50, 60, 200, 250, 400]) {
      state = applyXp(state, fact(amt, `occ-${amt}`)).state;
      expect(state.pcs['pc_wang']?.level).toBeGreaterThanOrEqual(lastLevel as number);
      lastLevel = state.pcs['pc_wang']?.level ?? lastLevel;
    }
  });

  it('AC-09: at level 20 XP is clamped to MAX_XP and no level-up is emitted', () => {
    let state = activatePc(createProgressionState(), 'pc_wang');
    state = applyXp(state, fact(xpRequiredToReach(20), 'occ-cap1')).state;
    expect(state.pcs['pc_wang']?.level).toBe(20);
    expect(state.pcs['pc_wang']?.xp).toBe(xpRequiredToReach(20));

    // Extra XP beyond the cap is clamped, no level-up, but the occurrence is credited.
    const before = state.pcs['pc_wang'];
    const result = applyXp(state, fact(10_000, 'occ-cap2'));
    expect(result.state.pcs['pc_wang']?.xp).toBe(MAX_XP);
    expect(result.state.pcs['pc_wang']?.level).toBe(MAX_LEVEL);
    expect(result.levelUps).toEqual([]);
    expect(result.credited).toBe(true);
    expect(result.state.pcs['pc_wang']?.creditedOccurrences).toContain('occ-cap2');
    expect(result.state.pcs['pc_wang']).not.toEqual(before);
  });
});

describe('FS-PROG-001 level curve helpers', () => {
  it('levelForXp maps thresholds deterministically and clamps at MAX_LEVEL', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(xpRequiredToReach(20))).toBe(20);
    expect(levelForXp(MAX_XP + 100_000)).toBe(20);
  });

  it('xpRequiredToReach is 0 at level 1 and grows monotonically', () => {
    expect(xpRequiredToReach(1)).toBe(0);
    let prev = -1;
    for (let l = MIN_LEVEL; l <= MAX_LEVEL; l += 1) {
      const v = xpRequiredToReach(l);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
