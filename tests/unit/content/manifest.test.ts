/**
 * FS-CONTENT-001 — manifest build, authored-order preservation, determinism.
 *
 * AC-10: a valid content set builds a manifest. AC-11: identical semantic
 * input yields byte-identical output, and semantically-ordered arrays keep the
 * author's order (never sorted — binding correction #2).
 */

import { describe, it, expect } from 'vitest';
import { validateContent, serializeManifest } from '../../../tools/validate-content/pipeline';
import { errorsOf, issuesWithMessage, required, src, yaml } from '../../helpers/content-fixtures';
import { VALID_SOURCES, VALID_LOCALE_SOURCES } from '../../helpers/valid-content-set';
import { allSkillIds } from '../../../src/domain/skills';

describe('FS-CONTENT-001 manifest build', () => {
  it('AC-10: a valid content set produces a manifest with every entity', () => {
    const result = validateContent({
      sources: [...VALID_SOURCES],
      localeSources: VALID_LOCALE_SOURCES,
    });
    expect(errorsOf(result.issues)).toHaveLength(0);
    const m = required(result.manifest, 'manifest');
    expect(m.meta.schemaVersion).toBe('1.0.0');
    expect(m.meta.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(m.chapters)).toHaveLength(1);
    expect(Object.keys(m.scenes)).toHaveLength(2);
    expect(Object.keys(m.npcs)).toHaveLength(1);
    expect(Object.keys(m.dialogues)).toHaveLength(1);
    expect(Object.keys(m.quests)).toHaveLength(1);
    expect(Object.keys(m.items)).toHaveLength(3);
    expect(Object.keys(m.skills)).toHaveLength(20);
    expect(Object.keys(m.codex)).toHaveLength(1);
    expect(Object.keys(m.audioCues)).toHaveLength(2);
    const zh = required(m.localization['zh-CN'], 'zh-CN locale map');
    expect(zh['chapter.ch04.title']).toBe('倒计时');
  });

  it('FS-SKILL-001: the content manifest exposes exactly the canonical 20-skill catalog', () => {
    const result = validateContent({
      sources: [...VALID_SOURCES],
      localeSources: VALID_LOCALE_SOURCES,
    });
    expect(errorsOf(result.issues)).toHaveLength(0);
    const m = required(result.manifest, 'manifest');
    expect(Object.keys(m.skills).sort()).toEqual([...allSkillIds()].sort());
    for (const skill of Object.values(m.skills)) {
      expect(skill.tree).toMatch(/^(investigator|scientist|operator|strategist|humanist)$/);
    }
  });

  it('AC-10: manifest entity fields carry the normalized authored data', () => {
    const result = validateContent({
      sources: [...VALID_SOURCES],
      localeSources: VALID_LOCALE_SOURCES,
    });
    const m = required(result.manifest, 'manifest');
    expect(required(m.chapters['ch_common_04_countdown'], 'chapter').entrySceneId).toBe(
      'sc_ch04_lab_morning'
    );
    expect(required(m.scenes['sc_ch04_lab_morning'], 'scene').chapterId).toBe(
      'ch_common_04_countdown'
    );
    expect(required(m.npcs['npc_lab_colleague'], 'npc').defaultDialogueId).toBe(
      'dlg_ch04_camera_anomaly'
    );
    expect(required(m.dialogues['dlg_ch04_camera_anomaly'], 'dialogue').entryNode).toBe('n01');
    expect(required(m.quests['q_ch04_explain_countdown'], 'quest').initialState).toBe('available');
  });

  it('AC-11: authored order of gameplay arrays is preserved, never sorted', () => {
    const reversedChoices = src(
      'dialogue',
      'content/dialogue/order.yaml',
      yaml`
id: dlg_order
entryNode: n01
nodes:
  n01:
    speaker: narrator
    textKey: chapter.ch04.title
    onEnterEffects: []
    choices:
      - id: c_zulu
        textKey: chapter.ch04.title
        effects: []
        conditions: []
        next: end
      - id: c_alpha
        textKey: chapter.ch04.title
        effects: []
        conditions: []
        next: end
`
    );
    const result = validateContent({ sources: [reversedChoices] });
    const m = required(result.manifest, 'manifest');
    const dlg = required(m.dialogues['dlg_order'], 'dlg_order');
    const node = required(dlg.nodes['n01'], 'n01');
    expect(node.choices.map((c) => c.id)).toEqual(['c_zulu', 'c_alpha']);
    expect(node.choices.map((c) => c.id)).not.toEqual(['c_alpha', 'c_zulu']);
  });

  it('AC-11: question chain order and quest objective order are preserved', () => {
    const result = validateContent({
      sources: [...VALID_SOURCES],
      localeSources: VALID_LOCALE_SOURCES,
    });
    const m = required(result.manifest, 'manifest');
    const dlg = required(m.dialogues['dlg_ch04_camera_anomaly'], 'dlg_ch04_camera_anomaly');
    const dNode = required(dlg.nodes['n01'], 'n01');
    expect(dNode.choices.map((c) => c.id)).toEqual(['c_ask', 'c_hide']);
    expect(required(dNode.choices[0], 'choice[0]').effects.map((e) => e.kind)).toEqual([
      'quest_event',
    ]);
    expect(required(dNode.choices[1], 'choice[1]').effects.map((e) => e.kind)).toEqual([
      'adjust_relationship',
    ]);
    const quest = required(m.quests['q_ch04_explain_countdown'], 'q_ch04_explain_countdown');
    expect(quest.objectives.map((o) => o.id)).toEqual(['obj_compare', 'obj_talk']);
    expect(required(m.scenes['sc_ch04_lab_morning'], 'sc_ch04_lab_morning').spawnPoints).toEqual([
      'sp_entrance',
    ]);
  });

  it('AC-11: semantic-equivalent inputs serialise to identical bytes', () => {
    const a = validateContent({
      sources: [...VALID_SOURCES],
      localeSources: VALID_LOCALE_SOURCES,
    });
    const shuffled = [...VALID_SOURCES].reverse();
    const b = validateContent({
      sources: shuffled,
      localeSources: [...VALID_LOCALE_SOURCES].reverse(),
    });
    expect(serializeManifest(required(a.manifest, 'a.manifest'))).toBe(
      serializeManifest(required(b.manifest, 'b.manifest'))
    );
  });

  it('AC-11: the manifest map records are key-sorted for stable bytes', () => {
    const two = validateContent({
      sources: [
        src(
          'npc',
          'content/npcs/npc_beta.yaml',
          yaml`
id: npc_beta
nameKey: npc.beta.name
role: research_assistant
era: common
portraitSet: p
relationshipPolicy: weighted
tags: []
`
        ),
        src(
          'npc',
          'content/npcs/npc_alpha.yaml',
          yaml`
id: npc_alpha
nameKey: npc.alpha.name
role: research_assistant
era: common
portraitSet: p
relationshipPolicy: weighted
tags: []
`
        ),
      ],
    });
    expect(errorsOf(two.issues)).toHaveLength(0);
    expect(Object.keys(required(two.manifest, 'manifest').npcs)).toEqual(['npc_alpha', 'npc_beta']);
    expect(Object.keys(required(two.manifest, 'manifest').npcs)).not.toEqual([
      'npc_beta',
      'npc_alpha',
    ]);
  });

  it('AC-03/AC-12: category maps reject duplicate ids at manifest build time', () => {
    const dup = src(
      'npc',
      'content/npcs/twin.yaml',
      yaml`
id: npc_lab_colleague
nameKey: npc.twin.name
role: research_assistant
era: common
portraitSet: p
relationshipPolicy: weighted
tags: []
`
    );
    const result = validateContent({ sources: [required(VALID_SOURCES[3], 'NPC_COLLEAGUE'), dup] });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'duplicate').length).toBeGreaterThan(0);
    expect(result.manifest).toBeNull();
  });
});
