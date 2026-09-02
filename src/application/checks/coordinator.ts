/**
 * Checks Coordinator (FS-SKILL-001 AC-12 / WO-021)
 *
 * Application-level orchestration only. Reads the CURRENT canonical state
 * (progression OWNS attributes, skills OWNS skill values, dialogue OWNS the
 * parked check), resolves the deterministic RollV1 tier, and maps the three
 * tiers onto the dialogue's fixed binary edge (clear/costly -> passed,
 * failed -> failed) so the WO-011 dialogue runtime can commit.
 *
 * The coordinator never mutates, never stores attributes/bonuses, never
 * consumes `progression.level-up`, and is the single injection point for
 * per-chapter DifficultyConfig overrides (WO-024/WO-030).
 */
import type { DialogueSavedState } from '../../domain/dialogue';
import { getPendingSkillCheck } from '../../domain/dialogue';
import type { DialogueManifest } from '../../domain/content';
import type { ProgressionSavedState } from '../../domain/progression';
import { DEFAULT_ATTRIBUTE_VALUES, type AttributeId } from '../../domain/progression';
import type { SkillsSavedState } from '../../domain/skills';
import { primaryAttributeOf } from '../../domain/skills';
import {
  DEFAULT_DIFFICULTY_CONFIG,
  resolveSkillCheck,
  skillValue,
  type CheckTier,
  type DifficultyConfig,
} from '../../domain/skills';

/** The dialogue edge the coordinator reports. */
export type DialogueCheckOutcome = 'passed' | 'failed';

/** Full observable result of a coordinated check (tier + roll evidence). */
export interface CoordinatedCheckResult {
  tier: CheckTier;
  roll: number;
  attempts: number;
  score: number;
  result: number;
  dialogueOutcome: DialogueCheckOutcome;
  skillId: string;
  threshold: number;
}

export interface ResolveCoordinatedCheckInput {
  dialogue: DialogueSavedState;
  progression: ProgressionSavedState;
  skills: SkillsSavedState;
  /** Stable PC identity; attributes and skill values are read from it. */
  pcId: string;
  /** Dialogue content crediting the active node's choices. */
  content: DialogueManifest;
  /** Optional per-chapter override; defaults to the canonical common config. */
  config?: DifficultyConfig;
}

/** Thrown when the coordinator is invoked without a parked check. */
export class NoPendingSkillCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoPendingSkillCheckError';
  }
}

const DEFAULT_CONFIG: DifficultyConfig = { ...DEFAULT_DIFFICULTY_CONFIG };

/** Current primary-attribute value for a PC, falling back to canonical defaults. */
function attributeValueFor(
  progression: ProgressionSavedState,
  pcId: string,
  attributeId: AttributeId
): number {
  return progression.pcs[pcId]?.attributes[attributeId] ?? DEFAULT_ATTRIBUTE_VALUES[attributeId];
}

/**
 * Resolve the currently-parked dialogue skill check from the player's current
 * canonical state. Deterministic across reloads (identity-based RollV1).
 */
export function resolveCoordinatedCheck(
  input: ResolveCoordinatedCheckInput
): CoordinatedCheckResult {
  const { dialogue, progression, skills, pcId } = input;
  const config = { ...DEFAULT_CONFIG, ...(input.config ?? {}) };
  const session = dialogue.active;
  if (session === null) throw new NoPendingSkillCheckError('no active dialogue session');
  const pending = getPendingSkillCheck(session, input.content);
  if (pending === null) {
    throw new NoPendingSkillCheckError('no parked skill check on the active dialogue node');
  }

  const attributeId = primaryAttributeOf(pending.skillId);
  const result = resolveSkillCheck({
    skillId: pending.skillId,
    attributeValue: attributeValueFor(progression, pcId, attributeId),
    skillValue: skillValue(skills, pcId, pending.skillId),
    threshold: pending.threshold,
    evidenceBonus: 0,
    relationshipBonus: 0,
    situationalModifier: 0,
    die: config.die,
    clearMargin: config.clearMargin,
    seed: {
      dialogueId: pending.dialogueId,
      instanceOrdinal: pending.instanceOrdinal,
      nodeId: pending.nodeId,
      choiceId: pending.choiceId,
      skillId: pending.skillId,
    },
  });

  const dialogueOutcome: DialogueCheckOutcome = result.tier === 'failed' ? 'failed' : 'passed';
  return {
    tier: result.tier,
    roll: result.roll,
    attempts: result.attempts,
    score: result.score,
    result: result.result,
    dialogueOutcome,
    skillId: pending.skillId,
    threshold: pending.threshold,
  };
}
