/**
 * FS-PROG-001 AC-05 — archive meta-progression is structurally distinct from
 * per-PC progression and is never merged into, or mutated by, the XP/level/
 * activation reducers.
 */
import { describe, it, expect } from 'vitest';
import {
  createProgressionState,
  activatePc,
  applyXp,
  type XpSourceFact,
} from '../../../src/domain/progression';

function fact(pcId = 'pc_wang', xp = 100): XpSourceFact {
  return { pcId, occurrenceId: 'occ-1', xp };
}

describe('FS-PROG-001 archive separation', () => {
  it('createProgressionState yields an empty pcs map and canonical archive', () => {
    const state = createProgressionState();
    expect(state.pcs).toEqual({});
    expect(state.archive).toEqual({ discoverableCount: 0, lifetime: {} });
  });

  it('activatePc and applyXp never mutate the archive', () => {
    let state = createProgressionState();
    state.archive = { discoverableCount: 3, lifetime: { ev: 9 } };
    state = activatePc(state, 'pc_wang');
    state = applyXp(state, fact()).state;
    const archive = state.archive;
    expect(archive).toEqual({ discoverableCount: 3, lifetime: { ev: 9 } });
  });

  it('archive is a different shape from PcProgression (never merged)', () => {
    const state = createProgressionState();
    expect('pcId' in state.archive).toBe(false);
    expect('level' in state.archive).toBe(false);
    expect('xp' in state.archive).toBe(false);
    expect('creditedOccurrences' in state.archive).toBe(false);
  });
});
