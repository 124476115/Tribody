/**
 * FS-CONTENT-001 — domain purity (AC-14).
 *
 * src/domain/content must stay pure TypeScript: no Phaser, React, Zod, Node.js
 * built-ins, and no dependency on the runtime event kernel. Validation never
 * constructs DomainEvents; the pipeline output carries no event collection.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { validateContent } from '../../../tools/validate-content/pipeline';
import { required } from '../../helpers/content-fixtures';
import { VALID_SOURCES, VALID_LOCALE_SOURCES } from '../../helpers/valid-content-set';

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listTs(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('FS-CONTENT-001 domain purity', () => {
  const root = resolve(__dirname, '../../../');
  const domainDir = join(root, 'src/domain');

  it('AC-14: every domain/content file avoids framework and infra imports', () => {
    const files = ([] as string[]).concat(...['content'].map((d) => listTs(join(domainDir, d))));
    expect(files.length).toBeGreaterThan(0);

    for (const f of files) {
      const rel = relative(root, f);
      const text = readFileSync(f, 'utf8');
      expect(text.startsWith('/**'), `${rel} must start with a header comment`).toBe(true);
      const banned = /import .*(phaser|react|zod)|from ['"](node:|react|phaser|zod)|require\(/;
      expect(banned.test(text), `${rel} must not import framework/infra modules`).toBe(false);
      expect(text.includes('processEvent')).toBe(false);
      expect(text.includes('DomainEvent')).toBe(false);
      expect(text.includes('localStorage')).toBe(false);
      expect(text.includes('window.')).toBe(false);
    }
  });

  it('AC-14: the pipeline manifest carries no runtime event collection', () => {
    const result = validateContent({
      sources: [...VALID_SOURCES],
      localeSources: VALID_LOCALE_SOURCES,
    });
    expect(errorsOfUnit(result.issues)).toHaveLength(0);
    const manifest = required(result.manifest, 'manifest');
    expect(manifest).not.toHaveProperty('events');
    for (const scene of Object.values(manifest.scenes)) {
      expect(scene).not.toHaveProperty('onEnter_events');
    }
  });
});

function errorsOfUnit(issues: readonly { severity: string }[]): { severity: string }[] {
  return issues.filter((i) => i.severity === 'error');
}
