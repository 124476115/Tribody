/**
 * FS-PROG-001 — typed failure modes and activation semantics. `applyXp` to an
 * unknown PC is a typed `pc-not-activated` error (never a silent fabricate);
 * invalid XP is `non-positive-xp`. `activatePc` is idempotent and introduces a
 * PC deterministically. Runtime is pure (no input mutation).
 */
import { describe, it, expect } from 'vitest';
import {
  createProgressionState,
  activatePc,
  applyXp,
  ProgressionError,
  type XpSourceFact,
} from '../../../src/domain/progression';

function fact(partial: Partial<XpSourceFact> = {}): XpSourceFact {
  return { pcId: 'pc_wang', occurrenceId: 'occ-1', xp: 100, ...partial };
}

describe('FS-PROG-001 typed failures + activation', () => {
  it('applyXp to an unknown (unactivated) PC is a typed pc-not-activated error', () => {
    const state = createProgressionState();
    expect(() => applyXp(state, fact())).toThrowError(ProgressionError);
    let caught;
    try {
      applyXp(state, fact());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProgressionError);
    expect((caught as ProgressionError).code).toBe('pc-not-activated');
  });

  it('non-positive or non-integer XP is a typed non-positive-xp error', () => {
    const state = activatePc(createProgressionState(), 'pc_wang');
    expect(() => applyXp(state, fact({ xp: 0 }))).toThrowError(ProgressionError);
    expect(() => applyXp(state, fact({ xp: -5 }))).toThrowError(ProgressionError);
    expect(() => applyXp(state, fact({ xp: 10.5 }))).toThrowError(ProgressionError);
  });

  it('activatePc is idempotent and creates canonical initial PC state', () => {
    let state = activatePc(createProgressionState(), 'pc_wang');
    const first = state.pcs['pc_wang'];
    state = activatePc(state, 'pc_wang');
    expect(state.pcs['pc_wang']).toBe(first); // unchanged reference when already present
    expect(state.pcs['pc_wang']).toEqual({
      pcId: 'pc_wang',
      level: 1,
      xp: 0,
      attributes: { intellect: 1, perception: 1, will: 1 },
      creditedOccurrences: [],
    });
  });

  it('runtime is pure: input state and fact are not mutated', () => {
    const state = activatePc(createProgressionState(), 'pc_wang');
    const frozen = JSON.stringify(state);
    const factSnapshot = JSON.stringify(fact());
    applyXp(state, fact());
    expect(JSON.stringify(state)).toBe(frozen);
    expect(JSON.stringify(fact())).toBe(factSnapshot);
  });
});
