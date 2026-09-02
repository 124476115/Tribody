#!/usr/bin/env node
/**
 * WO-001 pipeline negative-verification harness.
 *
 * PURPOSE
 * Prove that the quality pipeline is *genuinely failable* at each gate:
 *  - a deliberate formatting problem fails format:check
 *  - a deliberate TS error fails typecheck
 *  - a deliberate unit failure fails test:unit
 *  - a deliberate content problem fails validate:content
 *  - each of the above ALSO fails the whole `npm run quality` (propagation)
 *
 * TRANSIENT-ONLY
 * Every artifact is staged in `__pipeline_probe__` paths, removed in a
 * `finally`, and removed again on SIGINT/SIGTERM. The harness exits 0 only if
 * ALL expected failures actually occurred AND no probe paths remain. It never
 * leaves broken state in the repository.
 *
 * Exit codes:
 *   0   every expected failure happened; repo left clean
 *   1   an expected failure did NOT happen, or cleanup verification failed
 *
 * This is test tooling, not a runtime or CI platform.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PROBE_SRC_DIR = join(ROOT, 'src', '__pipeline_probe__');
const PROBE_TEST_DIR = join(ROOT, 'tests', 'unit', '__pipeline_probe__');
const PROBE_CONTENT_FILE = join(ROOT, 'content', 'scenes', '__pipeline_probe__.json');
const PROBE_PATHS = [PROBE_SRC_DIR, PROBE_TEST_DIR, PROBE_CONTENT_FILE];

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const tracked = [];
const passed = [];
const failed = [];

function track(absPath) {
  tracked.push(absPath);
}

function cleanupProbes() {
  for (const p of tracked) {
    rmSync(p, { recursive: true, force: true });
  }
  for (const p of PROBE_PATHS) {
    rmSync(p, { recursive: true, force: true });
  }
  tracked.length = 0;
}

process.on('SIGINT', () => {
  cleanupProbes();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanupProbes();
  process.exit(143);
});

function runNpm(script) {
  const res = spawnSync(NPM, ['run', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function stage(absPath, content) {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content);
  track(absPath);
}

function expectFail(label, script, absPath, content) {
  try {
    stage(absPath, content);
    if (!existsSync(absPath)) {
      failed.push(label);
      console.error(`  ERROR ${label} -> artifact could not be staged`);
      return;
    }
    const { status } = runNpm(script);
    if (status !== 0) {
      passed.push(label);
      console.log(`  ok   ${label}  (${script} exited ${status})`);
    } else {
      failed.push(label);
      console.error(`  FAIL ${label}  (${script} wrongly exited 0)`);
    }
  } catch (err) {
    failed.push(label);
    console.error(`  ERROR ${label} -> ${String(err)}`);
  } finally {
    cleanupProbes();
  }
}

function main() {
  console.log('[verify:pipeline] staging transient artifacts (all cleaned up)');

  // --- Isolated gate failures -----------------------------------------------
  expectFail(
    'formatted: check fails on a deliberate format problem',
    'format:check',
    join(PROBE_SRC_DIR, 'bad-format.tmp.ts'),
    "const  brokenIndent   =   'probe'  ;\n"
  );

  expectFail(
    'typecheck fails on a deliberate TS error',
    'typecheck',
    join(PROBE_SRC_DIR, 'bad-type.tmp.ts'),
    "export const broken: number = 'not-a-number';\n"
  );

  expectFail(
    'test:unit fails on a deliberate unit failure',
    'test:unit',
    join(PROBE_TEST_DIR, 'bad-unit.tmp.test.ts'),
    "import { it } from 'vitest';\n\nit('always fails (pipeline probe)', () => {\n  throw new Error('pipeline probe');\n});\n"
  );

  expectFail(
    'validate:content fails on authored content (WO-010 content schema)',
    'validate:content',
    PROBE_CONTENT_FILE,
    '{\n  "probe": true\n}\n'
  );

  // --- Propagation: deliberate failures kill the WHOLE quality command ------
  expectFail(
    'deliberate TS error fails npm run quality',
    'quality',
    join(PROBE_SRC_DIR, 'bad-type.tmp.ts'),
    "export const broken: number = 'not-a-number';\n"
  );

  expectFail(
    'deliberate unit failure fails npm run quality',
    'quality',
    join(PROBE_TEST_DIR, 'bad-unit.tmp.test.ts'),
    "import { it } from 'vitest';\n\nit('always fails (pipeline probe)', () => {\n  throw new Error('pipeline probe');\n});\n"
  );

  expectFail(
    'content validation failure propagates to npm run quality',
    'quality',
    PROBE_CONTENT_FILE,
    '{\n  "probe": true\n}\n'
  );

  expectFail(
    'deliberate format problem fails npm run quality',
    'quality',
    join(PROBE_SRC_DIR, 'bad-format.tmp.ts'),
    "const  brokenIndent   =   'probe'  ;\n"
  );

  // --- Cleanup verification --------------------------------------------------
  const leftovers = PROBE_PATHS.filter(existsSync);
  if (leftovers.length > 0) {
    for (const p of leftovers) {
      rmSync(p, { recursive: true, force: true });
    }
    failed.push(`leftover probe paths were removed at exit: ${leftovers.join(', ')}`);
  }

  console.log('');
  if (failed.length === 0) {
    console.log(
      `[verify:pipeline] ALL ${passed.length} EXPECTED FAILURES CONFIRMED — repo left clean`
    );
    console.log('  (run `npm run quality` now to confirm the clean state passes)');
    process.exit(0);
  }

  console.error(`[verify:pipeline] ${failed.length} check(s) did NOT behave as required:`);
  for (const f of failed) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

main();
