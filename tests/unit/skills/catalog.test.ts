/**
 * FS-SKILL-001 AC-13 — canonical skill catalog: exactly 5 trees × 4 skills =
 * 20 unique ids, every skill with exactly one primary attribute from the
 * WO-020 fixed attribute set.
 */
import { describe, it, expect } from 'vitest';
import {
  SKILL_TREES,
  CANONICAL_SKILLS,
  allSkillIds,
  skillsForTree,
  primaryAttributeOf,
} from '../../../src/domain/skills';
import { SAVE_ATTRIBUTE_IDS, type AttributeId } from '../../../src/domain/progression';

describe('FS-SKILL-001 canonical catalog', () => {
  it('AC-13: exposes exactly the five canonical trees', () => {
    expect(SKILL_TREES).toEqual([
      'investigator',
      'scientist',
      'operator',
      'strategist',
      'humanist',
    ]);
  });

  it('AC-13: each tree has exactly four skills and ids are unique', () => {
    const ids = allSkillIds();
    expect(new Set(ids).size).toBe(20);
    for (const tree of SKILL_TREES) {
      expect(skillsForTree(tree)).toHaveLength(4);
    }
  });

  it('AC-13: every skill maps to exactly one primary attribute from the progression set', () => {
    for (const skill of Object.values(CANONICAL_SKILLS)) {
      expect(SAVE_ATTRIBUTE_IDS).toContain(skill.primaryAttribute);
    }
  });

  it('AC-13: primary attribute lookup resolves for every canonical id', () => {
    for (const id of allSkillIds()) {
      const attr = primaryAttributeOf(id);
      expect(SAVE_ATTRIBUTE_IDS as readonly AttributeId[]).toContain(attr);
    }
  });

  it('AC-13: the catalog keeps the scientist experimental-design skill used by existing content', () => {
    expect(CANONICAL_SKILLS['skill_scientist_experimental_design']).toEqual({
      tree: 'scientist',
      primaryAttribute: 'intellect',
    });
  });
});
