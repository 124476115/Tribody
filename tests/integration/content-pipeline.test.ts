/**
 * FS-CONTENT-001 — end-to-end CLI pipeline (AC-13).
 *
 * The validator must be runnable as a real build step: exit 0 + manifest write
 * on valid content, exit 1 + diagnostics (with `→` path annotations, exact
 * error format `file → contentId → path → message`) and NO manifest on broken
 * content, exit 0 on an empty tree, fail on unsupported extensions, and ignore
 * the reference corpus (content_examples/).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import type { ContentSource, LocaleSource } from '../../tools/validate-content/pipeline';
import { VALID_SOURCES, VALID_LOCALE_SOURCES } from '../helpers/valid-content-set';
import { src, yaml } from '../helpers/content-fixtures';

const ROOT = process.cwd();
const TSBIN = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'tools', 'validate-content', 'index.ts');

function runCli(rootDir: string) {
  const res = spawnSync(TSBIN, [CLI, rootDir], { encoding: 'utf8' });
  if (res.status === null) {
    throw new Error(
      'SPAWNFAIL ' +
        JSON.stringify({
          error: String(res.error),
          stderr: res.stderr,
          stdout: res.stdout,
          tsbin: TSBIN,
          cli: CLI,
          root: rootDir,
        })
    );
  }
  return res;
}

function writeTree(
  rootDir: string,
  sources: readonly ContentSource[],
  localeSources: readonly LocaleSource[] = VALID_LOCALE_SOURCES
): void {
  for (const s of sources) {
    const rel = s.file.replace(/^content\//, '');
    const p = join(rootDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, s.source);
  }
  for (const l of localeSources) {
    const rel = l.file.replace(/^content\//, '');
    const p = join(rootDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, l.source);
  }
}

function manifestPath(rootDir: string): string {
  return join(rootDir, 'generated', 'manifest.json');
}

describe('FS-CONTENT-001 CLI pipeline', () => {
  let validRoot: string;
  let brokenRoot: string;
  let emptyRoot: string;

  beforeAll(() => {
    validRoot = mkdtempSync(join(tmpdir(), 'fs-content-valid-'));
    writeTree(validRoot, VALID_SOURCES);

    brokenRoot = mkdtempSync(join(tmpdir(), 'fs-content-broken-'));
    const brokenDialogue: ContentSource = src(
      'dialogue',
      'content/dialogue/broken.yaml',
      yaml`
id: dlg_broken
entryNode: n01
nodes:
  n01:
    speaker: narrator
    textKey: chapter.ch04.title
    choices:
      - id: c1
        textKey: chapter.ch04.title
        next: n99
`
    );
    writeTree(
      brokenRoot,
      [brokenDialogue],
      [
        {
          locale: 'zh-CN',
          file: 'content/localization/zh-CN/ch04.yaml',
          source: yaml`
chapter.ch04.title: "倒计时"
`,
        },
      ]
    );

    emptyRoot = mkdtempSync(join(tmpdir(), 'fs-content-empty-'));
  });

  afterAll(() => {
    for (const d of [validRoot, brokenRoot, emptyRoot]) {
      if (d) rmSync(d, { recursive: true, force: true });
    }
  });

  it('AC-13: valid content exits 0 and writes the manifest', () => {
    const res = runCli(validRoot);
    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
    const m = JSON.parse(readFileSync(manifestPath(validRoot), 'utf8'));
    expect(Object.keys(m.chapters)).toHaveLength(1);
    expect(Object.keys(m.npcs)).toHaveLength(1);
    expect(Object.keys(m.audioCues)).toHaveLength(2);
    expect(m.meta.schemaVersion).toBe('1.0.0');
  });

  it('AC-13: two runs produce byte-identical manifests (no timestamps)', () => {
    runCli(validRoot);
    const first = readFileSync(manifestPath(validRoot), 'utf8');
    runCli(validRoot);
    expect(readFileSync(manifestPath(validRoot), 'utf8')).toBe(first);
  });

  it('AC-13: a differently-ordered tree produces an identical manifest', () => {
    const reordered = mkdtempSync(join(tmpdir(), 'fs-content-reordered-'));
    try {
      writeTree(reordered, [...VALID_SOURCES].reverse());
      const res = runCli(reordered);
      expect(res.status).toBe(0);
      expect(readFileSync(manifestPath(reordered), 'utf8')).toBe(
        readFileSync(manifestPath(validRoot), 'utf8')
      );
    } finally {
      rmSync(reordered, { recursive: true, force: true });
    }
  });

  it('AC-13: broken content exits 1, prints `→` diagnostics, writes nothing', () => {
    const res = runCli(brokenRoot);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('→');
    expect(res.stderr).toContain('dlg_broken');
    expect(res.stderr).toContain('n99');
    expect(existsSync(manifestPath(brokenRoot))).toBe(false);
  });

  it('AC-13: an empty content tree exits 0 with empty record sets', () => {
    const res = runCli(emptyRoot);
    expect(res.status).toBe(0);
    const m = JSON.parse(readFileSync(manifestPath(emptyRoot), 'utf8'));
    expect(Object.keys(m.chapters)).toHaveLength(0);
    expect(Object.keys(m.scenes)).toHaveLength(0);
  });

  it('AC-13: unsupported file extensions inside category dirs fail', () => {
    const probe = mkdtempSync(join(tmpdir(), 'fs-content-probe-'));
    try {
      mkdirSync(join(probe, 'scenes'), { recursive: true });
      writeFileSync(join(probe, 'scenes', 'x.json'), '{}');
      const res = runCli(probe);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('x.json');
    } finally {
      rmSync(probe, { recursive: true, force: true });
    }
  });

  it('AC-08: the reference corpus (content_examples/) is ignored by the scanner', () => {
    const reference = mkdtempSync(join(tmpdir(), 'fs-content-reference-'));
    try {
      mkdirSync(join(reference, 'content_examples', 'dialogue'), { recursive: true });
      writeFileSync(
        join(reference, 'content_examples', 'dialogue', 'dlg_concept.yaml'),
        yaml`
id: dlg_concept
entryNode: n01
nodes:
  n01:
    speaker: narrator
    text: inline prose lives here
    choices: []
`
      );
      const res = runCli(reference);
      expect(res.status).toBe(0);
      expect(readdirSync(join(reference, 'generated'))).toEqual(['manifest.json']);
    } finally {
      rmSync(reference, { recursive: true, force: true });
    }
  });
});
