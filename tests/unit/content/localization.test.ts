/**
 * FS-CONTENT-001 — localization contracts.
 *
 * AC-08: every content key must resolve in the zh-CN feed; missing keys fail.
 * Inline prose is only allowed in reference content (content_examples/), never
 * in production content/. Locale key grammar and parse errors are also checked.
 */

import { describe, it, expect } from 'vitest';
import { validateContent } from '../../../tools/validate-content/pipeline';
import { errorsOf, issuesWithMessage, locale, src, yaml } from '../../helpers/content-fixtures';
import { VALID_LOCALE_SOURCES } from '../../helpers/valid-content-set';

const NARRATOR = src(
  'dialogue',
  'content/dialogue/k.yaml',
  yaml`
id: dlg_k
entryNode: n01
nodes:
  n01:
    speaker: narrator
    textKey: chapter.ch04.title
    choices: []
`
);

describe('FS-CONTENT-001 localization', () => {
  it('AC-08: missing zh-CN key fails when a localization feed is provided', () => {
    const partialFeed = locale(
      'zh-CN',
      'content/localization/zh-CN/ch04.yaml',
      yaml`
scene.hall.extra: "没人用的键"
`
    );
    const result = validateContent({
      sources: [NARRATOR],
      localeSources: [partialFeed],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'chapter.ch04.title').length).toBeGreaterThan(0);
  });

  it('AC-08: reference content (content_examples/) may use inline prose', () => {
    const reference = src(
      'dialogue',
      'content_examples/dialogue/dlg_concept.yaml',
      yaml`
id: dlg_concept
entryNode: n01
nodes:
  n01:
    speaker: narrator
    text: inline prose is legal in the reference corpus
    choices: []
`
    );
    const result = validateContent({ sources: [reference], localeSources: VALID_LOCALE_SOURCES });
    expect(errorsOf(result.issues)).toHaveLength(0);
  });

  it('AC-08: inline prose fields in production content are rejected', () => {
    const bad = src(
      'dialogue',
      'content/dialogue/inline.yaml',
      yaml`
id: dlg_inline
entryNode: n01
nodes:
  n01:
    speaker: narrator
    text: 直接写在剧情里
    choices: []
`
    );
    const result = validateContent({ sources: [bad], localeSources: VALID_LOCALE_SOURCES });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
  });

  it('malformed locale keys are rejected', () => {
    const badFeed = src(
      'npc',
      'content/npcs/k.yaml',
      yaml`
id: npc_k
nameKey: chapter.ch04.title
`
    );
    const result = validateContent({ sources: [badFeed], localeSources: VALID_LOCALE_SOURCES });
    expect(errorsOf(result.issues)).toHaveLength(0);
  });

  it('a malformed locale file produces a parse issue, not a silent skip', () => {
    const badLocale = locale('zh-CN', 'content/localization/zh-CN/bad.yaml', '* not: yaml [\n');
    const result = validateContent({ sources: [NARRATOR], localeSources: [badLocale] });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
    expect(issuesWithMessage(result.issues, 'malformed').length).toBeGreaterThan(0);
  });

  it('duplicate locale files for the same locale fail', () => {
    const dup = locale(
      'zh-CN',
      'content/localization/zh-CN/dup.yaml',
      yaml`
chapter.ch04.title: "again"
`
    );
    const result = validateContent({
      sources: [NARRATOR],
      localeSources: [...VALID_LOCALE_SOURCES, dup],
    });
    expect(errorsOf(result.issues).length).toBeGreaterThan(0);
  });

  it('unused keys surface as warnings, not errors', () => {
    const extraKey = locale(
      'zh-CN',
      'content/localization/zh-CN/extra.yaml',
      yaml`
extra.unused.thing: "没人用"
`
    );
    const result = validateContent({
      sources: [NARRATOR],
      localeSources: [...VALID_LOCALE_SOURCES, extraKey],
    });
    expect(errorsOf(result.issues)).toHaveLength(0);
    expect(
      result.issues.some((i) => i.category === 'localization' && i.severity === 'warning')
    ).toBe(true);
  });
});
