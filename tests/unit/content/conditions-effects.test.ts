/**
 * FS-CONTENT-001 — conditions and effects contract.
 *
 * AC-05: unknown condition/effect kinds fail. AC-06: canon-protected flags can
 * never be set via set_flag. Malformed payloads and bad semantic event names
 * fail; non-canon flags and well-formed events pass.
 */

import { describe, it, expect } from 'vitest';
import { validateContent } from '../../../tools/validate-content/pipeline';
import { errorsOf, issuesWithMessage, src, yaml } from '../../helpers/content-fixtures';
import { DLG_ANOMALY, NPC_COLLEAGUE, SKILL_DESIGN } from '../../helpers/valid-content-set';

function dlgWith(block: string): ReturnType<typeof src> {
  const lines = block
    .trim()
    .split('\n')
    .filter((l) => l.trim() !== '');
  return src(
    'dialogue',
    'content/dialogue/effects.yaml',
    yaml`
id: dlg_effects
entryNode: n01
nodes:
  n01:
    speaker: npc_lab_colleague
    textKey: t.effects.text
    choices:
      - id: c1
        textKey: t.effects.text
        conditions: []
        effects:
${lines.map((l, idx) => `          ${idx === 0 ? '- ' : '  '}${l.trim()}`).join('\n')}
        next: end
`
  );
}

describe('FS-CONTENT-001 conditions/effects contract', () => {
  it('AC-05: unknown effect kind fails', () => {
    const result = validateContent({
      sources: [dlgWith('kind: nope'), NPC_COLLEAGUE, DLG_ANOMALY, SKILL_DESIGN],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'discriminator').length).toBeGreaterThan(0);
  });

  it('AC-05: effect with missing required payload fails', () => {
    const result = validateContent({
      sources: [dlgWith('kind: add_item'), NPC_COLLEAGUE, DLG_ANOMALY, SKILL_DESIGN],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
  });

  it('AC-06: set_flag on canon.* is rejected', () => {
    const result = validateContent({
      sources: [
        dlgWith('kind: set_flag\nflag: canon.soviet_mst.contact_truth'),
        NPC_COLLEAGUE,
        DLG_ANOMALY,
        SKILL_DESIGN,
      ],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'canon').length).toBeGreaterThan(0);
  });

  it('AC-06: set_flag on era.transition.* is rejected', () => {
    const result = validateContent({
      sources: [
        dlgWith('kind: set_flag\nflag: era.transition.to_common'),
        NPC_COLLEAGUE,
        DLG_ANOMALY,
        SKILL_DESIGN,
      ],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'canon').length).toBeGreaterThan(0);
  });

  it('AC-06: set_flag on ordinary flags is allowed', () => {
    const result = validateContent({
      sources: [
        dlgWith('kind: set_flag\nflag: flag.ch04.camera.first_look'),
        NPC_COLLEAGUE,
        DLG_ANOMALY,
        SKILL_DESIGN,
      ],
    });
    expect(errorsOf(result.issues)).toHaveLength(0);
  });

  it('quest_event / emit_narrative_event require semantic event names', () => {
    const bad = validateContent({
      sources: [
        dlgWith('kind: quest_event\nevent: "Oh no!"'),
        NPC_COLLEAGUE,
        DLG_ANOMALY,
        SKILL_DESIGN,
      ],
    });
    expect(errorsOf(bad.issues).length).toBeGreaterThan(0);

    const good = validateContent({
      sources: [
        dlgWith('kind: emit_narrative_event\nevent: ch04.raw_data_compare_requested'),
        NPC_COLLEAGUE,
        DLG_ANOMALY,
        SKILL_DESIGN,
      ],
    });
    expect(errorsOf(good.issues)).toHaveLength(0);
  });

  it('set_flag flags must be story flags (chapter-scoped)', () => {
    const bad = validateContent({
      sources: [
        dlgWith('kind: set_flag\nflag: random_global'),
        NPC_COLLEAGUE,
        DLG_ANOMALY,
        SKILL_DESIGN,
      ],
    });
    expect(errorsOf(bad.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(bad.issues, 'random_global').length).toBeGreaterThan(0);
  });
});
