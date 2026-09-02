/**
 * FS-SKILL-001 AC-09..AC-11 — three-tier band boundaries, the exact score
 * formula, and current-state-at-resolution semantics (deterministic per
 * identical current state; reload-changing attributes/skill deterministically
 * rescues or fails a parked check).
 */
import { describe, it, expect } from 'vitest';
import {
  resolveSkillCheck,
  DEFAULT_DIFFICULTY_CONFIG,
  type SkillCheckInput,
  type SkillCheckSeed,
} from '../../../src/domain/skills';

const SEED: SkillCheckSeed = {
  dialogueId: 'dlg_sample_conversation',
  instanceOrdinal: 1,
  nodeId: 'n03',
  choiceId: 'c_skill',
  skillId: 'skill_scientist_experimental_design',
};

function input(partial: Partial<SkillCheckInput> = {}): SkillCheckInput {
  return {
    skillId: SEED.skillId,
    attributeValue: 1,
    skillValue: 0,
    threshold: 6,
    evidenceBonus: 0,
    relationshipBonus: 0,
    situationalModifier: 0,
    die: DEFAULT_DIFFICULTY_CONFIG.die,
    clearMargin: DEFAULT_DIFFICULTY_CONFIG.clearMargin,
    seed: SEED,
    ...partial,
  };
}

describe('FS-SKILL-001 resolveSkillCheck', () => {
  it('AC-10: score is exactly attribute + skill + evidence + relationship + situational', () => {
    const res = resolveSkillCheck(
      input({
        attributeValue: 2,
        skillValue: 1,
        evidenceBonus: 1,
        relationshipBonus: 2,
        situationalModifier: -1,
      })
    );
    expect(res.score).toBe(5);
  });

  it('AC-09: failed when result < threshold; boundary below threshold is failed', () => {
    const res = resolveSkillCheck(input({ attributeValue: 0, skillValue: 0, threshold: 31 }));
    // roll is fixed by the frozen seed (roll=3), score=0 => result 3 < 31
    expect(res.roll).toBe(3);
    expect(res.score).toBe(0);
    expect(res.result).toBe(3);
    expect(res.tier).toBe('failed');
  });

  it('AC-09: equality at threshold is costly (threshold <= result)', () => {
    const res = resolveSkillCheck(
      input({ attributeValue: 3, skillValue: 1, evidenceBonus: 0, threshold: 7 })
    );
    // score = 3 + 1 + 0 + 0 + 0 = 4; roll = 3 => result 7 == threshold
    expect(res.result).toBe(7);
    expect(res.tier).toBe('costly');
  });

  it('AC-09: costly interior — threshold <= result < threshold + clearMargin', () => {
    // score = 4 + 1 = 5; roll = 3 => result 8; costly band [7, 10)
    const res = resolveSkillCheck(input({ attributeValue: 4, skillValue: 1, threshold: 7 }));
    expect(res.result).toBe(8);
    expect(res.tier).toBe('costly');
  });

  it('AC-09: equality at the margin edge (result == threshold + clearMargin) is clear', () => {
    // score = 6 + 1 = 7; roll = 3 => result 10 == 7 + 3
    const res = resolveSkillCheck(input({ attributeValue: 6, skillValue: 1, threshold: 7 }));
    expect(res.result).toBe(10);
    expect(res.tier).toBe('clear');
  });

  it('AC-09: comfortably clear — result >= threshold + clearMargin', () => {
    // score = 8; roll = 3 => result 11 >= 10
    const res = resolveSkillCheck(input({ attributeValue: 7, skillValue: 1, threshold: 7 }));
    expect(res.result).toBe(11);
    expect(res.tier).toBe('clear');
  });

  it('AC-11: same current state => same deterministic tier (including roll and attempts)', () => {
    const a = resolveSkillCheck(input());
    const b = resolveSkillCheck(input());
    expect(a).toEqual(b);
    expect(a.attempts).toBe(0);
  });

  it('AC-11: resolution uses CURRENT state — raising an attribute deterministically rescues a failed check', () => {
    const low = resolveSkillCheck(input({ attributeValue: 0, skillValue: 0, threshold: 10 }));
    const raised = resolveSkillCheck(input({ attributeValue: 9, skillValue: 1, threshold: 10 }));
    expect(low.tier).toBe('failed');
    expect(raised.tier).toBe('clear');
    expect(low.result).not.toBe(raised.result);
  });

  it('AC-11: changing only instanceOrdinal reseeds the roll independently', () => {
    const same = resolveSkillCheck(input());
    const other = resolveSkillCheck(input({ seed: { ...SEED, instanceOrdinal: 2 } }));
    expect(same.roll).toBeGreaterThan(0);
    expect(other.roll).not.toBe(same.roll);
  });
});
