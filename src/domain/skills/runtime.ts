/**
 * Skills Domain — runtime (FS-SKILL-001)
 *
 * Pure, non-mutating reducers over `SkillsSavedState` plus the deterministic
 * check resolver. No Phaser, React, Zod, or Node.js built-ins.
 *
 * Invariants:
 * - Learn-only acquisition: the only mutation is `values[skill] 0 -> 1`.
 * - Dedup is per (occurrenceId, skillId) in the per-PC persisted ledger
 *   (AC-02); learning an already-owned skill from a different occurrence is a
 *   deterministic `already-learned` with no change (AC-03).
 * - Unknown skill ids throw a typed `SkillsError('unknown-skill')` (AC-04).
 * - Checks consume numeric facts (attribute value, skill value, bonuses) with
 *   CURRENT-state-at-resolution semantics (AC-11); skill resolution never
 *   stores attributes or bonus state.
 */
import { primaryAttributeOf, type SkillTree } from './catalog';
import { rollV1, skillCheckRollSeed } from './roll';
import {
  DEFAULT_DIFFICULTY_CONFIG,
  SkillsError,
  type CheckTier,
  type DifficultyConfig,
  type LearnSkillFact,
  type LearnSkillResult,
  type PcSkills,
  type SkillCheckInput,
  type SkillCheckResult,
  type SkillCheckSeed,
  type SkillsSavedState,
} from './types';

/** Canonical empty skills state: no PCs. */
export function createSkillsState(): SkillsSavedState {
  return { pcs: {} };
}

function ledgerEntry(fact: LearnSkillFact): string {
  return `${fact.occurrenceId}::${fact.skillId}`;
}

/**
 * Learn a skill for a PC. Idempotent per (occurrenceId, skillId); a PC record
 * is created unconditionally on a first successful learn (learning is the
 * activation trigger). Returns the next immutable state and the deterministic
 * outcome.
 */
export function learnSkill(state: SkillsSavedState, fact: LearnSkillFact): LearnSkillResult {
  if (!isCanonical(fact.skillId)) throw new SkillsError(`unknown skill "${fact.skillId}"`);
  const existing = state.pcs[fact.pcId];
  const entry = ledgerEntry(fact);

  if (existing !== undefined) {
    if (existing.learnLedger.includes(entry)) {
      return { state, outcome: 'duplicate' };
    }
    if (existing.values[fact.skillId] === 1) {
      return { state, outcome: 'already-learned' };
    }
    const nextPc: PcSkills = {
      ...existing,
      values: { ...existing.values, [fact.skillId]: 1 },
      learnLedger: [...existing.learnLedger, entry],
    };
    return { state: { ...state, pcs: { ...state.pcs, [fact.pcId]: nextPc } }, outcome: 'learned' };
  }

  const pc: PcSkills = {
    pcId: fact.pcId,
    values: { [fact.skillId]: 1 },
    learnLedger: [entry],
  };
  return { state: { ...state, pcs: { ...state.pcs, [fact.pcId]: pc } }, outcome: 'learned' };
}

/** Canonical 0|1 skill value for a PC (0 when unlearned; unknown skill throws). */
export function skillValue(state: SkillsSavedState, pcId: string, skillId: string): 0 | 1 {
  if (!isCanonical(skillId)) throw new SkillsError(`unknown skill "${skillId}"`);
  return state.pcs[pcId]?.values[skillId] ?? 0;
}

function isCanonical(skillId: string): boolean {
  try {
    primaryAttributeOf(skillId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a deterministic three-tier check. Pure: computes the frozen RollV1
 * seed, sums the numeric inputs, and applies the bands:
 *   result < threshold                          -> failed
 *   threshold <= result < threshold+clearMargin -> costly
 *   result >= threshold + clearMargin           -> clear
 */
export function resolveSkillCheck(input: SkillCheckInput): SkillCheckResult {
  if (!isCanonical(input.skillId)) throw new SkillsError(`unknown skill "${input.skillId}"`);
  const seed = skillCheckRollSeed(input.seed);
  const roll = rollV1(seed, input.die);
  const score =
    input.attributeValue +
    input.skillValue +
    input.evidenceBonus +
    input.relationshipBonus +
    input.situationalModifier;
  const result = score + roll.roll;
  const tier: CheckTier =
    result < input.threshold
      ? 'failed'
      : result < input.threshold + input.clearMargin
        ? 'costly'
        : 'clear';
  return { tier, roll: roll.roll, attempts: roll.attempts, score, result };
}

/** Default die/clearMargin payload for tests/callers. */
export function defaultCheckConfig(): DifficultyConfig {
  return { die: DEFAULT_DIFFICULTY_CONFIG.die, clearMargin: DEFAULT_DIFFICULTY_CONFIG.clearMargin };
}

export type { SkillCheckSeed };
export type { SkillTree };
