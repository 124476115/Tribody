#!/usr/bin/env node
/**
 * WO-001 validate:content placeholder.
 *
 * PIPELINE PLACEHOLDER ONLY. It proves the `validate:content` command is wired
 * into the quality pipeline and FAILS with a non-zero exit code when its input
 * is bad. It does NOT implement any content schema, referential integrity,
 * graph checks, or narrative DSL — those belong to WO-010 (Content Schema).
 *
 * Placeholder contract:
 *   1. required content category directories exist (docs/06 layout);
 *   2. no authored content files yet (only .gitkeep / hidden files) -> PASS;
 *   3. any authored content file present -> FAIL with "WO-010 pending",
 *      so the pipeline never silently accepts content it cannot validate.
 *
 * Exit codes: 0 = PASS, 1 = FAIL.
 */

import { readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTENT_DIR = join(ROOT, 'content');

const REQUIRED_DIRS = [
  'audio',
  'chapters',
  'codex',
  'dialogue',
  'items',
  'localization',
  'medals',
  'npcs',
  'quests',
  'scenes',
  'skills',
];

const errors = [];

for (const dir of REQUIRED_DIRS) {
  const p = join(CONTENT_DIR, dir);
  if (!existsSync(p) || !statSync(p).isDirectory()) {
    errors.push(`missing required content directory: content/${dir}`);
  }
}

if (errors.length === 0) {
  for (const dir of REQUIRED_DIRS) {
    for (const entry of readdirSync(join(CONTENT_DIR, dir))) {
      if (entry.startsWith('.')) {
        continue;
      }
      errors.push(
        `content/${dir}/${entry}: authored content detected but validation pending WO-010`
      );
    }
  }
}

if (errors.length === 0) {
  console.log(
    '[validate:content] PASS (placeholder: no authored content; real validation lands in WO-010)'
  );
  process.exit(0);
}

for (const e of errors) {
  console.error(`[validate:content] FAIL: ${e}`);
}
console.error('[validate:content] placeholder contract: never silently accept unvalidated content');
process.exit(1);
