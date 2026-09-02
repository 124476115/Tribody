/**
 * FS-PROG-001 AC-04 — per-chapter-PC independence. Progression is keyed by a
 * stable `pcId`; the same source fact occurrence can legitimately credit two
 * different PCs (each with its own ledger), and applying XP to one PC never
 * affects another.
 */
import { describe, it, expect } from 'vitest';
import {
  createProgressionState,
  activatePc,
  applyXp,
  type XpSourceFact,
} from '../../../src/domain/progression';

function fact(pcId: string, occurrenceId: string, xp: number): XpSourceFact {
  return { pcId, occurrenceId, xp };
}

describe('FS-PROG-001 per-PC independence', () => {
  it('two PCs start independently at level 1 with their own state', () => {
    let state = createProgressionState();
    state = activatePc(state, 'pc_wang');
    state = activatePc(state, 'pc_cheng');
    expect(state.pcs['pc_wang']?.level).toBe(1);
    expect(state.pcs['pc_cheng']?.level).toBe(1);
    expect(state.pcs['pc_wang']).not.toBe(state.pcs['pc_cheng']);
  });

  it('crediting one PC does not affect another PC', () => {
    let state = createProgressionState();
    state = activatePc(state, 'pc_wang');
    state = activatePc(state, 'pc_cheng');
    state = applyXp(state, fact('pc_wang', 'occ-x', 500)).state;
    expect(state.pcs['pc_wang']?.level).toBe(3);
    expect(state.pcs['pc_cheng']?.level).toBe(1);
    expect(state.pcs['pc_cheng']?.xp).toBe(0);
  });

  it('the same occurrenceId can credit two different PCs (per-PC ledgers)', () => {
    let state = createProgressionState();
    state = activatePc(state, 'pc_wang');
    state = activatePc(state, 'pc_cheng');
    state = applyXp(state, fact('pc_wang', 'occ-shared', 100)).state;
    state = applyXp(state, fact('pc_cheng', 'occ-shared', 100)).state;
    expect(state.pcs['pc_wang']?.creditedOccurrences).toEqual(['occ-shared']);
    expect(state.pcs['pc_wang']?.xp).toBe(100);
    expect(state.pcs['pc_cheng']?.creditedOccurrences).toEqual(['occ-shared']);
    expect(state.pcs['pc_cheng']?.xp).toBe(100);
  });

  it('PC state keys are the stable pcId, not display text', () => {
    let state = createProgressionState();
    state = activatePc(state, 'pc_wang');
    expect(Object.keys(state.pcs)).toEqual(['pc_wang']);
    expect(state.pcs['pc_wang']?.pcId).toBe('pc_wang');
  });
});
