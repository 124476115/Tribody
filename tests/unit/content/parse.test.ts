/**
 * FS-CONTENT-001 — YAML parse layer.
 *
 * AC-12: malformed YAML and duplicate YAML keys must be rejected at parse time,
 * before any schema work. Roots that are not mappings are refused too.
 */

import { describe, it, expect } from 'vitest';
import { validateContent } from '../../../tools/validate-content/pipeline';
import { errorsOf, issuesWithMessage, src, yaml } from '../../helpers/content-fixtures';

describe('FS-CONTENT-001 parse layer', () => {
  it('AC-12: malformed yaml is reported as a parse issue', () => {
    const result = validateContent({
      sources: [src('npc', 'content/npcs/corrupt.yaml', ': not: [valid\n')],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'malformed').length).toBeGreaterThan(0);
    expect(result.manifest).toBeNull();
  });

  it('AC-12: duplicate yaml keys are rejected', () => {
    const result = validateContent({
      sources: [
        src(
          'npc',
          'content/npcs/dup.yaml',
          yaml`
id: npc_lab_colleague
nameKey: npc.dup.one
id: npc_other
`
        ),
      ],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'keys must be unique').length).toBeGreaterThan(0);
  });

  it('AC-12: a non-mapping root is rejected', () => {
    const result = validateContent({
      sources: [src('npc', 'content/npcs/list.yaml', '- just a list\n')],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
  });
});
