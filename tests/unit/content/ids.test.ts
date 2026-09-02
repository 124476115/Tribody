/**
 * FS-CONTENT-001 — content ID grammar.
 *
 * AC-03 / AC-12: malformed IDs and duplicate IDs are rejected; the ID is read
 * from the YAML `id` field, never from the filename (binding correction #3).
 */

import { describe, it, expect } from 'vitest';
import {
  isContentIdSyntax,
  isValidNodeId,
  isValidChoiceId,
  isValidObjectiveId,
} from '@domain/content';
import type { ContentCategory } from '@domain/content';
import { validateContent } from '../../../tools/validate-content/pipeline';
import { errorsOf, issuesWithMessage, src, yaml } from '../../helpers/content-fixtures';

const AGENTS_SAMPLE_IDS: [ContentCategory, string][] = [
  ['chapter', 'ch_common_04_countdown'],
  ['scene', 'sc_ch04_lab_morning'],
  ['npc', 'npc_lab_colleague'],
  ['dialogue', 'dlg_ch04_camera_anomaly_sample'],
  ['quest', 'q_ch04_explain_countdown'],
  ['item', 'item_document_log'],
  ['skill', 'skill_scientist_experimental_design'],
  ['codex', 'codex_science_falsifiability'],
  ['audioCue', 'cue_ambience_observatory'],
];

const MALFORMED: [ContentCategory, string, string][] = [
  ['chapter', 'Ch_common_04', 'uppercase'],
  ['npc', 'npc-lab', 'hyphen'],
  ['npc', 'npc.lab', 'dot'],
  ['npc', '_npc_lab', 'leading underscore'],
  ['npc', 'npc_lab_', 'trailing underscore'],
  ['npc', `npc_${'x'.repeat(80)}`, 'over length limit'],
  ['dialogue', 'sc_ch04_lab', 'wrong prefix for category'],
  ['quest', 'q_', 'empty slug'],
];

describe('FS-CONTENT-001 ID grammar', () => {
  it('AC-03: accepts every AGENTS-sanctioned sample id', () => {
    for (const [category, id] of AGENTS_SAMPLE_IDS) {
      expect(isContentIdSyntax(category, id), `${category}:${id}`).toBe(true);
    }
  });

  it('AC-12: rejects malformed ids', () => {
    for (const [category, id] of AGENTS_SAMPLE_IDS) {
      expect(isContentIdSyntax(category, id)).toBe(true);
    }
    for (const [category, id, why] of MALFORMED) {
      expect(isContentIdSyntax(category, id), `${why}: ${id}`).toBe(false);
    }
  });

  it('AC-12: a schema error reports the offending path', () => {
    const result = validateContent({
      sources: [
        src(
          'npc',
          'content/npcs/Bad-Id.yaml',
          yaml`
id: BAD-ID
nameKey: whatever
`
        ),
      ],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.file === 'content/npcs/Bad-Id.yaml')).toBe(true);
  });

  it('AC-03: duplicate ids across different files fail as duplicate-id', () => {
    const first = src(
      'npc',
      'content/npcs/a.yaml',
      yaml`
id: npc_lab_colleague
nameKey: npc.dup.one
`
    );
    const second = src(
      'npc',
      'content/npcs/b.yaml',
      yaml`
id: npc_lab_colleague
nameKey: npc.dup.two
`
    );
    const result = validateContent({ sources: [first, second] });
    expect(issuesWithMessage(result.issues, 'duplicate id')).toHaveLength(1);
    expect(issuesWithMessage(result.issues, 'npc_lab_colleague').length).toBeGreaterThan(0);
  });

  it('AC-03: the authoritative id is read from content, not the filename', () => {
    const result = validateContent({
      sources: [
        src(
          'dialogue',
          'content/dialogue/secret_looking_name.yaml',
          yaml`
id: dlg_ch04_camera_anomaly
entryNode: n01
nodes:
  n01:
    speaker: narrator
    textKey: dlg.graph.text
    choices: []
`
        ),
      ],
    });
    expect(errorsOf(result.issues)).toHaveLength(0);
    expect(result.manifest?.dialogues['dlg_ch04_camera_anomaly']).toBeDefined();
  });

  it('node/choice/objective ids accept safe syntax and reject escapes', () => {
    expect(isValidNodeId('n01')).toBe(true);
    expect(isValidNodeId('decision_exit')).toBe(true);
    expect(isValidNodeId('../escape')).toBe(false);
    expect(isValidNodeId('N01')).toBe(false);
    expect(isValidNodeId('end')).toBe(false);
    expect(isValidChoiceId('c_ask')).toBe(true);
    expect(isValidChoiceId('c_ask!')).toBe(false);
    expect(isValidObjectiveId('obj_compare')).toBe(true);
    expect(isValidObjectiveId('obj compare')).toBe(false);
  });
});
