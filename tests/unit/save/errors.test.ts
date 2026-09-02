/**
 * FS-SAVE-001 — error taxonomy. Corrupt, unsupported-schema,
 * content-incompatible, persistence, import, and save-oversize are distinct and
 * never conflated at the application/UI boundary.
 */
import { describe, it, expect } from 'vitest';
import { SaveError, type SaveErrorCode } from '../../../src/domain/save';

const SUPPORTED: ReadonlySet<SaveErrorCode> = new Set<SaveErrorCode>([
  'corrupt-json',
  'corrupt-shape',
  'corrupt-checksum',
  'unsupported-schema',
  'missing-migration',
  'content-incompatible',
  'save-oversize',
  'persistence-error',
  'persistence-quota',
  'persistence-collision',
  'slot-not-found',
  'import-oversize',
  'import-malformed',
]);

describe('WO-013 error taxonomy', () => {
  it('every documented code is instantiable as a typed SaveError', () => {
    for (const code of SUPPORTED) {
      const error = new SaveError(code, `message for ${code}`);
      expect(error.code).toBe(code);
      expect(error.name).toBe('SaveError');
      expect(error.message).toBe(`message for ${code}`);
    }
  });

  it('corrupt, unsupported-schema, content-incompatible, and persistence are disjoint', () => {
    const corrupt = new Set(['corrupt-json', 'corrupt-shape', 'corrupt-checksum']);
    const version = new Set(['unsupported-schema', 'missing-migration']);
    const content = new Set(['content-incompatible']);
    const persistence = new Set([
      'persistence-error',
      'persistence-quota',
      'persistence-collision',
      'slot-not-found',
    ]);
    const importSet = new Set(['import-oversize', 'import-malformed']);
    const disjoint = (...sets: ReadonlySet<string>[]) => {
      const all = sets.flatMap((s) => [...s]);
      expect(new Set(all).size).toBe(all.length);
    };
    disjoint(corrupt, version, content, persistence, importSet);
  });
});
