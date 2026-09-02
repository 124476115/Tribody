/**
 * Shared helpers for FS-CONTENT-001 tests.
 *
 * Builds in-memory YAML content sources and locale sources the same way the
 * build pipeline consumes them, so unit tests never touch the filesystem.
 */

import type { ContentSource, LocaleSource } from '../../tools/validate-content/pipeline';
import type { ContentCategory, ContentIssue } from '@domain/content';

/** Strip the common leading indentation from a YAML template literal. */
export function yaml(strings: TemplateStringsArray, ...values: unknown[]): string {
  let raw = '';
  for (let i = 0; i < strings.length; i++) {
    raw += strings[i];
    if (i < values.length) raw += String(values[i]);
  }
  const lines = raw.split('\n');
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  const indents = lines
    .filter((l) => l.trim() !== '')
    .map((l) => (l.match(/^ */)?.[0].length ?? 0) as number);
  const min = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n') + '\n';
}

export function src(category: ContentCategory, file: string, source: string): ContentSource {
  return { category, file, source };
}

export function locale(localeName: string, file: string, source: string): LocaleSource {
  return { locale: localeName, file, source };
}

export function hasCategory(
  issues: readonly ContentIssue[],
  category: ContentIssue['category']
): boolean {
  return issues.some((i) => i.category === category);
}

export function issuesWithMessage(
  issues: readonly ContentIssue[],
  fragment: string
): ContentIssue[] {
  return issues.filter((i) => i.message.includes(fragment));
}

export function errorsOf(issues: readonly ContentIssue[]): ContentIssue[] {
  return issues.filter((i) => i.severity === 'error');
}

/** Non-null assertion helper: fails loudly instead of using `!` (lint-clean). */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected a value for ${what}`);
  }
  return value;
}
