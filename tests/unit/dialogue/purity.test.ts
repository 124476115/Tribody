/**
 * FS-DIALOGUE-001 — domain purity (layering constraint).
 *
 * src/domain/dialogue must stay pure TypeScript: no Phaser, React, Zod, or
 * Node.js built-ins; only the content domain may be imported.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

describe('WO-011 dialogue domain purity', () => {
  const domainDir = resolve(__dirname, '../../../src/domain/dialogue');

  it('src/domain/dialogue stays framework- and infra-free', () => {
    const files = listTs(domainDir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text.startsWith('/**'), `${f} must start with a header comment`).toBe(true);
      const banned =
        /import .*(phaser|react|zod)|from ['"](node:|react|phaser|zod|svelte|vue)|require\(/;
      expect(banned.test(text), `${f} must not import framework/infra modules`).toBe(false);
      expect(text.includes('localStorage')).toBe(false);
      expect(text.includes('window.')).toBe(false);
    }
  });

  it('domain/dialogue only imports sibling modules and the content domain', () => {
    for (const f of listTs(domainDir)) {
      const text = readFileSync(f, 'utf8');
      for (const line of text.split('\n')) {
        const m = /from '(\.[^']*)'/.exec(line);
        if (m === null) continue;
        const target = m[1] as string;
        if (target.startsWith('.')) continue;
        if (target === '../content') continue;
        expect(target, `${f}: disallowed sibling import "${target}"`).toBe('../content');
      }
    }
  });
});
