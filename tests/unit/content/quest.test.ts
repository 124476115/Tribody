/**
 * FS-CONTENT-001 — quest contract.
 *
 * AC-07: invalid quest objectives (unknown type, malformed objective id, no
 * required objective) must fail.
 */

import { describe, it, expect } from 'vitest';
import { validateContent } from '../../../tools/validate-content/pipeline';
import { errorsOf, issuesWithMessage, src, yaml } from '../../helpers/content-fixtures';

function questWith(objBlock?: string): ReturnType<typeof src> {
  return src(
    'quest',
    'content/quests/q_broken.yaml',
    yaml`
id: q_broken
chapterId: ch_common_04_countdown
titleKey: t.quest.title
initialState: available
objectives:
  - id: obj_compare
    type: analyze
    required: true
    listensFor:
      - ch04.raw_data_compare_requested
${objBlock ?? ''}
resolution:
  onAllRequiredComplete: resolved_success
journal:
  startKey: t.quest.s
  completeKey: t.quest.c
`
  );
}

describe('FS-CONTENT-001 quest contract', () => {
  it('AC-07: unknown objective type fails', () => {
    const result = validateContent({
      sources: [questWith('  - id: obj_x\n    type: avant_garde\n    required: true\n')],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'Invalid option').length).toBeGreaterThan(0);
  });

  it('AC-07: malformed objective id fails', () => {
    const result = validateContent({
      sources: [questWith('  - id: "Obj Bad!"\n    type: analyze\n    required: true\n')],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
  });

  it('AC-07: a quest must have at least one required objective', () => {
    const dlg = src(
      'quest',
      'content/quests/q_no.yaml',
      yaml`
id: q_no_required
chapterId: ch_common_04_countdown
titleKey: t.quest.title
initialState: available
objectives:
  - id: obj_1
    type: analyze
    required: false
resolution:
  onAllRequiredComplete: resolved_success
journal:
  startKey: t.quest.s
  completeKey: t.quest.c
`
    );
    const result = validateContent({ sources: [dlg] });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'required').length).toBeGreaterThan(0);
  });

  it('AC-07: duplicate objective ids fail', () => {
    const result = validateContent({
      sources: [questWith('  - id: obj_compare\n    type: talk\n    required: true\n')],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
  });

  it('invalid initialState is rejected', () => {
    const dlg = src(
      'quest',
      'content/quests/q_bad.yaml',
      yaml`
id: q_bad_state
chapterId: ch_common_04_countdown
titleKey: t.quest.title
initialState: banana
objectives:
  - id: obj_1
    type: analyze
    required: true
resolution:
  onAllRequiredComplete: resolved_success
journal:
  startKey: t.quest.s
  completeKey: t.quest.c
`
    );
    const result = validateContent({ sources: [dlg] });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
  });
});
