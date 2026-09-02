/**
 * FS-CONTENT-001 — hard reference integrity.
 *
 * AC-02: missing NPC references fail. AC-04: a chapter whose entry scene is
 * missing or whose scene back-references mismatch must fail. Effects and
 * skill-checks referencing missing items/codex/cues/skills must fail too.
 */

import { describe, it, expect } from 'vitest';
import { validateContent } from '../../../tools/validate-content/pipeline';
import {
  errorsOf,
  hasCategory,
  issuesWithMessage,
  src,
  yaml,
} from '../../helpers/content-fixtures';
import {
  NPC_COLLEAGUE,
  SC_LAB_MORNING,
  SC_HALL,
  CH_CHAPTER,
  DLG_ANOMALY,
  Q_EXPLAIN,
  SKILL_DESIGN,
  CODEX_FALSIFIABILITY,
  CUE_AMBIENCE,
  CUE_MUSIC,
} from '../../helpers/valid-content-set';

function validateWith(sources: ReturnType<typeof src>[]) {
  return validateContent({ sources });
}

describe('FS-CONTENT-001 reference integrity', () => {
  it('AC-02: dialogue speaker referencing a missing npc fails', () => {
    const dlg = src(
      'dialogue',
      'content/dialogue/broken.yaml',
      yaml`
id: dlg_broken
entryNode: n01
nodes:
  n01:
    speaker: npc_does_not_exist
    textKey: t.ref.text
    choices: []
`
    );
    const result = validateWith([dlg, NPC_COLLEAGUE]);
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'npc_does_not_exist').length).toBeGreaterThan(0);
  });

  it('AC-02: scene npc list referencing a missing npc fails', () => {
    const bad = src(
      'scene',
      'content/scenes/broken.yaml',
      yaml`
id: sc_ch04_broken
chapterId: ch_common_04_countdown
titleKey: t.ref.title
mapId: map_broken
spawnPoints: []
npcs:
  - npcId: npc_missing
interactables: []
onEnter: []
exits: []
`
    );
    const result = validateWith([bad, CH_CHAPTER]);
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'npc_missing').length).toBeGreaterThan(0);
  });

  it('AC-02: npc defaultDialogueId referencing a missing dialogue fails', () => {
    const npc = src(
      'npc',
      'content/npcs/broken.yaml',
      yaml`
id: npc_broken
nameKey: t.ref.name
role: research_assistant
era: common
portraitSet: p
defaultDialogueId: dlg_missing
relationshipPolicy: weighted
tags: []
`
    );
    const result = validateWith([npc]);
    expect(issuesWithMessage(result.issues, 'dlg_missing').length).toBeGreaterThan(0);
  });

  it('AC-02: quest objective npcId / skillId references failing', () => {
    const q = src(
      'quest',
      'content/quests/broken.yaml',
      yaml`
id: q_broken
chapterId: ch_common_04_countdown
titleKey: t.ref.title
initialState: available
objectives:
  - id: obj_1
    type: talk
    required: true
    npcId: npc_gone
resolution:
  onAllRequiredComplete: resolved_success
journal:
  startKey: t.ref.s
  completeKey: t.ref.c
`
    );
    const result = validateWith([q, NPC_COLLEAGUE]);
    expect(issuesWithMessage(result.issues, 'npc_gone').length).toBeGreaterThan(0);
  });

  it('AC-02: effect and condition references to missing entities fail', () => {
    const dlg = src(
      'dialogue',
      'content/dialogue/refs.yaml',
      yaml`
id: dlg_refs
entryNode: n01
nodes:
  n01:
    speaker: npc_lab_colleague
    textKey: t.ref.text
    choices:
      - id: c1
        textKey: t.ref.text
        conditions:
          - kind: skill_at_least
            skillId: skill_missing
            value: 1
        effects:
          - kind: add_item
            itemId: item_missing
          - kind: add_codex
            codexId: codex_missing
          - kind: play_audio
            cueId: cue_missing
        next: end
`
    );
    const result = validateWith([
      dlg,
      NPC_COLLEAGUE,
      SKILL_DESIGN,
      CODEX_FALSIFIABILITY,
      CUE_AMBIENCE,
      CUE_MUSIC,
    ]);
    for (const target of ['skill_missing', 'item_missing', 'codex_missing', 'cue_missing']) {
      expect(issuesWithMessage(result.issues, target).length).toBeGreaterThan(0);
    }
  });

  it('AC-04: chapter entrySceneId referencing a missing scene fails', () => {
    const bad = src(
      'chapter',
      'content/chapters/broken.yaml',
      yaml`
id: ch_common_99_broken
actId: act_02_countdown
order: 99
era: common
titleKey: t.ref.title
playableCharacterId: pc_chen_mo
entrySceneId: sc_missing
assetPack: pack_ch04
prerequisites: []
canonAnchors: []
`
    );
    const result = validateWith([bad, SC_LAB_MORNING]);
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'sc_missing').length).toBeGreaterThan(0);
  });

  it('AC-04: scene chapterId mismatch with the owning chapter fails', () => {
    const wrongChapter = src(
      'scene',
      'content/scenes/mismatch.yaml',
      yaml`
id: sc_mismatch
chapterId: ch_common_01
titleKey: t.ref.title
mapId: map
spawnPoints: []
npcs: []
interactables: []
onEnter: []
exits: []
`
    );
    const result = validateWith([wrongChapter, CH_CHAPTER]);
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
  });

  it('valid fixtures produce no missing-ref issues', () => {
    const result = validateWith([
      CH_CHAPTER,
      SC_LAB_MORNING,
      SC_HALL,
      NPC_COLLEAGUE,
      DLG_ANOMALY,
      Q_EXPLAIN,
      SKILL_DESIGN,
      CODEX_FALSIFIABILITY,
      CUE_AMBIENCE,
      CUE_MUSIC,
    ]);
    expect(hasCategory(result.issues, 'missing-ref')).toBe(false);
    expect(errorsOf(result.issues)).toHaveLength(0);
  });
});
