/**
 * FS-CONTENT-001 — dialogue graph rules.
 *
 * AC-01: `next` targeting a node that does not exist fails. AC-09: cyclic
 * autoNext chains fail. Entry node must exist and every node must be reachable
 * from it; `end` is the only reserved terminal.
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
import { DLG_ANOMALY, NPC_COLLEAGUE, SKILL_DESIGN } from '../../helpers/valid-content-set';

function dlgYaml(nodeBlock: string): string {
  return yaml`
id: dlg_graph_test
entryNode: n01
nodes:
${nodeBlock
  .split('\n')
  .map((l) => (l === '' ? l : `  ${l}`))
  .join('\n')}
`;
}

describe('FS-CONTENT-001 dialogue graph', () => {
  it('AC-01: next targeting a missing node fails', () => {
    const dlg = src(
      'dialogue',
      'content/dialogue/graph.yaml',
      dlgYaml(`
n01:
  speaker: narrator
  textKey: t.graph.text
  choices:
    - id: c1
      textKey: t.graph.text
      next: n99
`)
    );
    const result = validateContent({ sources: [dlg] });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'n99').length).toBeGreaterThan(0);
  });

  it('AC-01: next = end is the valid terminal shortcut', () => {
    const dlg = src(
      'dialogue',
      'content/dialogue/graph.yaml',
      dlgYaml(`
n01:
  speaker: narrator
  textKey: t.graph.text
  choices:
    - id: c1
      textKey: t.graph.text
      next: end
`)
    );
    const result = validateContent({ sources: [dlg] });
    expect(errorsOf(result.issues)).toHaveLength(0);
  });

  it('duplicate node ids and duplicate choice ids within a node fail as graph', () => {
    const dlg = src(
      'dialogue',
      'content/dialogue/graph.yaml',
      dlgYaml(`
n01:
  speaker: narrator
  textKey: t.graph.text
  choices:
    - id: c1
      textKey: t.graph.text
      next: n02
    - id: c1
      textKey: t.graph.text
      next: end
n02:
  speaker: narrator
  textKey: t.graph.text
  choices: []
  autoNext: end
`)
    );
    const result = validateContent({ sources: [dlg] });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
  });

  it('missing entryNode target fails as graph', () => {
    const dlg = src(
      'dialogue',
      'content/dialogue/graph.yaml',
      yaml`
id: dlg_graph_test
entryNode: nZZ
nodes:
  n01:
    speaker: narrator
    textKey: t.graph.text
    choices: []
`
    );
    const result = validateContent({ sources: [dlg] });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'nZZ').length).toBeGreaterThan(0);
  });

  it('AC-09: autoNext cycle is rejected', () => {
    const dlg = src(
      'dialogue',
      'content/dialogue/graph.yaml',
      dlgYaml(`
n01:
  speaker: narrator
  textKey: t.graph.text
  choices: []
  autoNext: n02
n02:
  speaker: narrator
  textKey: t.graph.text
  choices: []
  autoNext: n03
n03:
  speaker: narrator
  textKey: t.graph.text
  choices: []
  autoNext: n01
`)
    );
    const result = validateContent({ sources: [dlg] });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'cycle').length).toBeGreaterThan(0);
  });

  it('a node that is unreachable from the entry node fails as graph', () => {
    const dlg = src(
      'dialogue',
      'content/dialogue/graph.yaml',
      dlgYaml(`
n01:
  speaker: narrator
  textKey: t.graph.text
  choices: []
  autoNext: end
n02:
  speaker: narrator
  textKey: t.graph.text
  choices: []
  autoNext: end
`)
    );
    const result = validateContent({ sources: [dlg] });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'unreachable').length).toBeGreaterThan(0);
  });

  it('a valid dialogue produces no graph issues', () => {
    const result = validateContent({ sources: [NPC_COLLEAGUE, SKILL_DESIGN, DLG_ANOMALY] });
    expect(hasCategory(result.issues, 'graph')).toBe(false);
    expect(errorsOf(result.issues)).toHaveLength(0);
  });
});
