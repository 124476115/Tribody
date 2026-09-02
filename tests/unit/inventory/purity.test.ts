/**
 * FS-INV-001 — domain purity (layering constraint).
 *
 * src/domain/inventory must stay pure TypeScript: no Phaser, React, Zod, or
 * Node.js built-ins, no browser APIs, and every file opens with the doc-header
 * convention expected by the repo.
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

describe('FS-INV-001 inventory domain purity', () => {
  const domainDir = resolve(__dirname, '../../../src/domain/inventory');

  it('stays framework- and infra-free', () => {
    const files = listTs(domainDir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text.startsWith('/**'), `${f} must start with a header comment`).toBe(true);
      const banned =
        /import .*(phaser|react|zod)|from ['"](node:|react|phaser|zod|svelte|vue)|require\(/;
      expect(banned.test(text), `${f} must not import framework/infra modules`).toBe(false);
      expect(text.includes('IndexedDB')).toBe(false);
      expect(text.includes('localStorage')).toBe(false);
      expect(text.includes('window.')).toBe(false);
    }
  });
});
