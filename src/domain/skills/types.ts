/**
 * Skills Domain — core types (FS-SKILL-001)
 *
 * Pure TypeScript value contracts for the deterministic skills/checks runtime.
 * No Phaser, React, Zod, or Node.js built-ins.
 *
 * Design invariants (WO-021 plan review):
 * - `SkillsSavedState` is canonical continuation state (schema v4).
 * - Progression OWNS attributes; skills only READ them (checks consume the
 *   primary attribute value as a numeric input; skills never store attributes).
 * - Bonuses (evidence/relationship/situational) are numeric inputs only; no
 *   placeholder state is created in this domain.
 * - Value state is strictly `0 | 1` (learn-only acquisition, no ranks/budget
 *   in WO-021); the v4 guard enforces exactly that.
 * - Dedup is per `(occurrenceId, skillId)` in the persisted per-PC ledger.
 */

/** Canonical tree ids — the tightened, fixed set. */
export const SKILL_TREES = [
  'investigator',
  'scientist',
  'operator',
  'strategist',
  'humanist',
] as const;

export type SkillTreeId = (typeof SKILL_TREES)[number];

/** Per-PC, persisted canonical skill value state (schema v4). */
export interface PcSkills {
  /** Stable persistent identity; equals the map key; never display text. */
  pcId: string;
  /** Canonical skill keys ONLY; values exactly 0|1. */
  values: Record<string, 0 | 1>;
  /**
   * Persisted dedup ledger entries `<occurrenceId>::<skillId>`; survives
   * reload. Dedup is per (occurrenceId, skillId), so one occurrence may
   * legitimately grant different skills.
   */
  learnLedger: string[];
}

/** The persisted skills envelope joined into SavePayload.domain (schema v4). */
export interface SkillsSavedState {
  /** Keyed by stable pcId; appears only when a learn commits. */
  pcs: Record<string, PcSkills>;
}

/** The learn-award input. `occurrenceId` is STABLE and owned by the producer. */
export interface LearnSkillFact {
  pcId: string;
  /** Skill being learned — must be canonical. */
  skillId: string;
  /** Stable occurrence identity owned by the producer. */
  occurrenceId: string;
}

/** Outcome of one `learnSkill` call. */
export type LearnSubjectOutcome = 'learned' | 'duplicate' | 'already-learned';

export interface LearnSkillResult {
  /** Next immutable state. */
  state: SkillsSavedState;
  outcome: LearnSubjectOutcome;
}

/** The deterministic three-tier outcome of a skill check. */
export type CheckTier = 'failed' | 'costly' | 'clear';

/**
 * The roll identity. Game checks construct this from the dialogue session
 * (dialogueId + instanceOrdinal + node + choice + skillId); recomputed from
 * canonical state every resolution, so no per-check RNG state is persisted.
 */
export interface SkillCheckSeed {
  dialogueId: string;
  instanceOrdinal: number;
  nodeId: string;
  choiceId: string;
  skillId: string;
}

/** Central difficulty configuration (never per-content invisible numbers). */
export interface DifficultyConfig {
  /** Die faces. Default 20. */
  die: number;
  /**
   * Clear band half-width: `result >= threshold + clearMargin` is clear,
   * `threshold <= result < threshold + clearMargin` is costly.
   */
  clearMargin: number;
}

/** Canonical default. Per-chapter overrides (WO-024/WO-030) inject via the coordinator. */
export const DEFAULT_DIFFICULTY_CONFIG: DifficultyConfig = { die: 20, clearMargin: 3 };

/** Full numeric input to a check resolution (`SkillCheckInput`). */
export interface SkillCheckInput {
  skillId: string;
  /** The skill's PRIMARY attribute value, current at resolution. */
  attributeValue: number;
  /** Canonical skill value, current at resolution. */
  skillValue: 0 | 1;
  /** Authored per-check threshold (content). */
  threshold: number;
  /** Numeric input only; default 0. */
  evidenceBonus: number;
  /** Numeric input only; default 0. */
  relationshipBonus: number;
  /** Numeric input only; default 0. */
  situationalModifier: number;
  /** Die faces; default DEFAULT_DIFFICULTY_CONFIG.die. */
  die: number;
  /** Clear band width; default DEFAULT_DIFFICULTY_CONFIG.clearMargin. */
  clearMargin: number;
  /** Roll identity (dialogue session + choice). */
  seed: SkillCheckSeed;
}

export interface SkillCheckResult {
  tier: CheckTier;
  /** Deterministic roll in [0, die). */
  roll: number;
  /** Retry attempts observed (0 for normal checks). */
  attempts: number;
  /** attribute + skill + bonuses + modifier. */
  score: number;
  /** score + roll. */
  result: number;
}

/** Typed, deterministic skills failure. Consumers branch on `.code`. */
export type SkillsErrorCode = 'unknown-skill';

export class SkillsError extends Error {
  readonly code: SkillsErrorCode;

  constructor(message: string) {
    super(message);
    this.name = 'SkillsError';
    this.code = 'unknown-skill';
  }
}
