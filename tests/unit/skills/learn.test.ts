/**
 * FS-SKILL-001 AC-01..AC-04 — learn-only acquisition with a persisted
 * per-(occurrenceId, skillId) dedup ledger, idempotency, deterministic
 * already-learned results, and typed errors for unknown skills.
 */
import { describe, it, expect } from 'vitest';
import {
  createSkillsState,
  learnSkill,
  skillValue,
  SkillsError,
  type SkillsSavedState,
} from '../../../src/domain/skills';

const SKILL = 'skill_scientist_experimental_design';

describe('FS-SKILL-001 learnSkill', () => {
  it('AC-01: learns a skill — value pivots exactly 0 -> 1 and the ledger records it', () => {
    const state = createSkillsState();
    const result = learnSkill(state, { pcId: 'pc_wang', skillId: SKILL, occurrenceId: 'occ-1' });
    expect(result.outcome).toBe('learned');
    expect(skillValue(result.state, 'pc_wang', SKILL)).toBe(1);
    expect(result.state.pcs['pc_wang']?.learnLedger).toEqual([
      'occ-1::skill_scientist_experimental_design',
    ]);
  });

  it('AC-01: values never take any value other than 0 or 1', () => {
    let state = createSkillsState();
    state = learnSkill(state, { pcId: 'pc_wang', skillId: SKILL, occurrenceId: 'occ-1' }).state;
    const unlearned = Object.values(state.pcs['pc_wang']?.values ?? {});
    unlearned.forEach((v) => expect([0, 1]).toContain(v));
  });

  it('AC-02: replaying the same occurrenceId+skillId is idempotent (duplicate, no change)', () => {
    let state = createSkillsState();
    state = learnSkill(state, { pcId: 'pc_wang', skillId: SKILL, occurrenceId: 'occ-1' }).state;
    const before = state.pcs['pc_wang'];
    const replay = learnSkill(state, { pcId: 'pc_wang', skillId: SKILL, occurrenceId: 'occ-1' });
    expect(replay.outcome).toBe('duplicate');
    expect(replay.state.pcs['pc_wang']).toEqual(before);
  });

  it('AC-03: learning an already-owned skill from a different occurrence is deterministic already-learned', () => {
    let state = createSkillsState();
    state = learnSkill(state, { pcId: 'pc_wang', skillId: SKILL, occurrenceId: 'occ-1' }).state;
    const before = state.pcs['pc_wang'];
    const again = learnSkill(state, { pcId: 'pc_wang', skillId: SKILL, occurrenceId: 'occ-2' });
    expect(again.outcome).toBe('already-learned');
    expect(again.state.pcs['pc_wang']).toEqual(before);
  });

  it('AC-04: learning an unknown skill is a typed unknown-skill error', () => {
    const state = createSkillsState();
    expect(() =>
      learnSkill(state, {
        pcId: 'pc_wang',
        skillId: 'skill_science_unknown',
        occurrenceId: 'occ-1',
      })
    ).toThrow(SkillsError);
    expect(learnSkillFailure(state, 'pc_wang', 'skill_science_unknown', 'occ-1')).toBe(
      'unknown-skill'
    );
  });

  it('is per-PC: the same occurrence can legitimately learn different skills for the same PC', () => {
    let state = createSkillsState();
    state = learnSkill(state, { pcId: 'pc_wang', skillId: SKILL, occurrenceId: 'occ-1' }).state;
    state = learnSkill(state, {
      pcId: 'pc_wang',
      skillId: 'skill_humanist_empathy',
      occurrenceId: 'occ-1',
    }).state;
    expect(skillValue(state, 'pc_wang', SKILL)).toBe(1);
    expect(skillValue(state, 'pc_wang', 'skill_humanist_empathy')).toBe(1);
    expect(state.pcs['pc_wang']?.learnLedger).toHaveLength(2);
  });

  it('is deterministic: identical inputs produce identical outputs', () => {
    const a = learnSkill(createSkillsState(), {
      pcId: 'pc_x',
      skillId: SKILL,
      occurrenceId: 'occ-9',
    });
    const b = learnSkill(createSkillsState(), {
      pcId: 'pc_x',
      skillId: SKILL,
      occurrenceId: 'occ-9',
    });
    expect(a.state).toEqual(b.state);
    expect(a.outcome).toBe(b.outcome);
  });
});

function learnSkillFailure(
  state: SkillsSavedState,
  pcId: string,
  skillId: string,
  occurrenceId: string
): string | null {
  try {
    learnSkill(state, { pcId, skillId, occurrenceId: occurrenceId });
    return null;
  } catch (err) {
    return err instanceof SkillsError ? err.code : String(err);
  }
}
