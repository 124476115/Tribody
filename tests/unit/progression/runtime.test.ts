/**
 * FS-PROG-001 AC-01 / AC-06 — deterministic, idempotent XP accrual with the
 * one-shot-occurrence guard. Repeating the same occurrence identity never
 * yields further XP; distinct occurrences (even with identical type/XP amount)
 * each award XP.
 */
import { describe, it, expect } from 'vitest';
import {
  createProgressionState,
  activatePc,
  applyXp,
  type XpSourceFact,
} from '../../../src/domain/progression';

function fact(partial: Partial<XpSourceFact> = {}): XpSourceFact {
  return { pcId: 'pc_wang', occurrenceId: 'occ-1', xp: 100, ...partial };
}

describe('FS-PROG-001 one-shot XP accrual', () => {
  it('credits XP and records the occurrence in the ledger', () => {
    let state = createProgressionState();
    state = activatePc(state, 'pc_wang');
    const result = applyXp(state, fact());
    expect(result.credited).toBe(true);
    expect(result.grantedXp).toBe(100);
    expect(result.state.pcs['pc_wang']?.xp).toBe(100);
    expect(result.state.pcs['pc_wang']?.creditedOccurrences).toEqual(['occ-1']);
  });

  it('AC-01/AC-06: replaying the same occurrence yields zero additional XP', () => {
    let state = createProgressionState();
    state = activatePc(state, 'pc_wang');
    let result = applyXp(state, fact({ xp: 500 }));
    state = result.state;
    const before = state.pcs['pc_wang'];
    result = applyXp(state, fact({ xp: 500 }));
    expect(result.credited).toBe(false);
    expect(result.grantedXp).toBe(0);
    expect(result.levelUps).toEqual([]);
    expect(result.state.pcs['pc_wang']).toEqual(before);
  });

  it('two distinct occurrences with the same amount both award XP', () => {
    let state = createProgressionState();
    state = activatePc(state, 'pc_wang');
    let result = applyXp(state, fact({ occurrenceId: 'occ-a', xp: 50 }));
    state = result.state;
    result = applyXp(state, fact({ occurrenceId: 'occ-b', xp: 50 }));
    expect(result.credited).toBe(true);
    expect(result.state.pcs['pc_wang']?.xp).toBe(100);
  });

  it('is deterministic: identical inputs produce identical outputs', () => {
    const a = applyXp(activatePc(createProgressionState(), 'pc_x'), fact({ pcId: 'pc_x' }));
    const b = applyXp(activatePc(createProgressionState(), 'pc_x'), fact({ pcId: 'pc_x' }));
    expect(a.state).toEqual(b.state);
    expect(a.levelUps).toEqual(b.levelUps);
  });
});
