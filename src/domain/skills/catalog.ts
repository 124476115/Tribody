/**
 * Skills Domain — canonical catalog (FS-SKILL-001 AC-13)
 *
 * Pure TypeScript. The canonical 5-tree x 4-skill table is DOMAIN-OWNED: the
 * primary-attribute mapping lives here and content cannot redefine it. Content
 * declares trees only (validated against SKILL_TREES).
 */
import { SAVE_ATTRIBUTE_IDS, type AttributeId } from '../progression';
import { SKILL_TREES, SkillsError } from './types';

export type SkillTree = (typeof SKILL_TREES)[number];

export interface SkillDefinition {
  skillId: string;
  tree: SkillTree;
  primaryAttribute: AttributeId;
}

/**
 * Canonical 20-skill table. Exactly 5 trees, exactly 4 skills per tree, each
 * skill with exactly one primary attribute from {intellect, perception, will}.
 * DO NOT extend key-wise without a schema decision + ContentEnrollment change.
 */
export const CANONICAL_SKILLS = {
  skill_investigator_pattern_recognition: { tree: 'investigator', primaryAttribute: 'perception' },
  skill_investigator_interview: { tree: 'investigator', primaryAttribute: 'perception' },
  skill_investigator_surveillance_awareness: {
    tree: 'investigator',
    primaryAttribute: 'perception',
  },
  skill_investigator_evidence_reconstruction: {
    tree: 'investigator',
    primaryAttribute: 'intellect',
  },

  skill_scientist_experimental_design: { tree: 'scientist', primaryAttribute: 'intellect' },
  skill_scientist_signal_analysis: { tree: 'scientist', primaryAttribute: 'perception' },
  skill_scientist_model_testing: { tree: 'scientist', primaryAttribute: 'intellect' },
  skill_scientist_cosmology_literacy: { tree: 'scientist', primaryAttribute: 'intellect' },

  skill_operator_repair: { tree: 'operator', primaryAttribute: 'intellect' },
  skill_operator_emergency_response: { tree: 'operator', primaryAttribute: 'will' },
  skill_operator_eva: { tree: 'operator', primaryAttribute: 'will' },
  skill_operator_navigation: { tree: 'operator', primaryAttribute: 'perception' },

  skill_strategist_risk_analysis: { tree: 'strategist', primaryAttribute: 'intellect' },
  skill_strategist_resource_command: { tree: 'strategist', primaryAttribute: 'will' },
  skill_strategist_deception_detection: { tree: 'strategist', primaryAttribute: 'perception' },
  skill_strategist_long_horizon: { tree: 'strategist', primaryAttribute: 'intellect' },

  skill_humanist_de_escalation: { tree: 'humanist', primaryAttribute: 'will' },
  skill_humanist_empathy: { tree: 'humanist', primaryAttribute: 'perception' },
  skill_humanist_cultural_memory: { tree: 'humanist', primaryAttribute: 'intellect' },
  skill_humanist_group_cohesion: { tree: 'humanist', primaryAttribute: 'will' },
} as const satisfies Record<string, { tree: SkillTree; primaryAttribute: AttributeId }>;

/** Re-export the tree enum for content schema use. */
export { SKILL_TREES } from './types';
export type { SkillTreeId } from './types';

/** All 20 canonical skill ids (uniqueness locked by tests). */
export function allSkillIds(): string[] {
  return Object.keys(CANONICAL_SKILLS);
}

/** The 4 skill ids of one tree. */
export function skillsForTree(tree: SkillTree): string[] {
  return Object.entries(CANONICAL_SKILLS)
    .filter(([, def]) => def.tree === tree)
    .map(([id]) => id);
}

/** Primary attribute for a canonical skill id. Throws on non-canonical id. */
export function primaryAttributeOf(skillId: string): AttributeId {
  const def = (CANONICAL_SKILLS as Record<string, { primaryAttribute: AttributeId } | undefined>)[
    skillId
  ];
  if (def === undefined) {
    throw new SkillsError(`unknown skill "${skillId}"`);
  }
  return def.primaryAttribute;
}

/** Whether `skillId` is a member of the canonical 20-skill set. */
export function isCanonicalSkill(skillId: string): boolean {
  return (CANONICAL_SKILLS as Record<string, unknown>)[skillId] !== undefined;
}

/** The attribute id set (from WO-020) — re-exported here for guard use. */
export const SKILL_PRIMARY_ATTRIBUTE_IDS: readonly string[] = [...SAVE_ATTRIBUTE_IDS];

/** Strongly-typed view of the catalog for schema/guard use. */
export const CANONICAL_SKILL_LIST: readonly SkillDefinition[] = allSkillIds().map((skillId) => {
  const def = (
    CANONICAL_SKILLS as Record<string, { tree: SkillTree; primaryAttribute: AttributeId }>
  )[skillId];
  if (def === undefined) {
    throw new SkillsError(`unknown skill "${skillId}"`);
  }
  return { skillId, tree: def.tree, primaryAttribute: def.primaryAttribute };
});
