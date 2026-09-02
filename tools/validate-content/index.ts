#!/usr/bin/env node
/**
 * Content CLI (WO-010)
 *
 * Discover the content tree, validate every authored YAML document against the
 * WO-010 authoring schemas, and — only when there are no error-level issues —
 * write the deterministic `content/generated/manifest.json`.
 *
 * Usage:
 *   tsx tools/validate-content/index.ts [rootDir]
 *
 *   rootDir defaults to the repository `content/` directory. The root layout is
 *   the documented category directories plus `localization/<locale>/*.yaml`.
 *   `content_examples/` is reference-only and is never scanned.
 *
 * Exit codes: 0 = valid (manifest written), 1 = invalid (nothing written).
 * Diagnostics go to stderr in the canonical `file → contentId → path → message`
 * format.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentCategory, ContentIssue } from '../../src/domain/content';
import {
  validateContent,
  serializeManifest,
  type ContentSource,
  type ContentInput,
  type LocaleSource,
} from './pipeline';

const CATEGORY_DIRS: readonly Readonly<{ dir: string; category: ContentCategory }>[] = [
  { dir: 'chapters', category: 'chapter' },
  { dir: 'scenes', category: 'scene' },
  { dir: 'npcs', category: 'npc' },
  { dir: 'dialogue', category: 'dialogue' },
  { dir: 'quests', category: 'quest' },
  { dir: 'items', category: 'item' },
  { dir: 'skills', category: 'skill' },
  { dir: 'codex', category: 'codex' },
  { dir: 'audio', category: 'audioCue' },
];

const YAML_EXTENSIONS: readonly string[] = ['.yaml', '.yml'];

function listFilesRec(dirAbs: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dirAbs)) {
    if (entry.startsWith('.')) continue;
    const full = join(dirAbs, entry);
    if (statSync(full).isDirectory()) out.push(...listFilesRec(full));
    else out.push(full);
  }
  return out;
}

function makeUnsupportedIssue(file: string, root: string): ContentIssue {
  return {
    severity: 'error',
    category: 'unsupported-extension',
    file: relative(root, file),
    message: `unsupported file extension (only .yaml/.yml are scanned)`,
  };
}

interface Discovery {
  sources: ContentSource[];
  localeSources: LocaleSource[];
  issues: ContentIssue[];
}

function discover(root: string): Discovery {
  const sources: ContentSource[] = [];
  const localeSources: LocaleSource[] = [];
  const issues: ContentIssue[] = [];

  for (const spec of CATEGORY_DIRS) {
    const dirAbs = join(root, spec.dir);
    if (!existsSync(dirAbs)) continue;
    for (const full of listFilesRec(dirAbs)) {
      const file = relative(root, full);
      if (YAML_EXTENSIONS.some((ext) => file.endsWith(ext))) {
        sources.push({ category: spec.category, file, source: readFileSync(full, 'utf8') });
      } else {
        issues.push(makeUnsupportedIssue(full, root));
      }
    }
  }

  const locDir = join(root, 'localization');
  if (existsSync(locDir)) {
    for (const localeName of readdirSync(locDir).sort()) {
      const localeDir = join(locDir, localeName);
      if (!statSync(localeDir).isDirectory()) continue;
      for (const full of listFilesRec(localeDir)) {
        const file = relative(root, full);
        if (YAML_EXTENSIONS.some((ext) => file.endsWith(ext))) {
          localeSources.push({ locale: localeName, file, source: readFileSync(full, 'utf8') });
        } else {
          issues.push(makeUnsupportedIssue(full, root));
        }
      }
    }
  }

  return { sources, localeSources, issues };
}

function formatIssue(issue: ContentIssue): string {
  const id = issue.contentId ?? '<no-id>';
  const path = issue.path ?? '.';
  return `${issue.severity}: ${issue.file} → ${id} → ${path} → ${issue.message}`;
}

function run(): void {
  const cliDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(cliDir, '..', '..');
  const root = process.argv[2] === undefined ? join(repoRoot, 'content') : resolve(process.argv[2]);

  const { sources, localeSources, issues } = discover(root);
  const input: ContentInput = { sources, localeSources };
  const result = validateContent(input);
  const allIssues = [...issues, ...result.issues];
  const errors = allIssues.filter((i) => i.severity === 'error');

  if (errors.length > 0) {
    for (const error of errors) console.error(formatIssue(error));
    process.exit(1);
  }

  if (result.manifest === null) {
    console.error('internal error: no manifest produced despite a clean validation result');
    process.exit(1);
  }

  const outDir = join(root, 'generated');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'manifest.json'), serializeManifest(result.manifest));

  for (const warning of allIssues.filter((i) => i.severity === 'warning')) {
    console.warn(formatIssue(warning));
  }
  const localeCount = new Set(localeSources.map((l) => l.locale)).size;
  console.log(
    `content validation passed: ${String(sources.length)} documents, ${String(localeCount)} locale(s) → generated/manifest.json`
  );
  process.exit(0);
}

run();
