/**
 * FS-SAVE-001 AC-02 — sequential migration.
 *
 * Production registry ships only real persisted formats (empty at v1). Sequential
 * migration (incl. spy order and no-jump) is proven with an injected test-only
 * registry. applyMigrations itself never bypasses a step.
 */
import { describe, it, expect } from 'vitest';
import {
  applyMigrations,
  Migrations,
  SAVE_SCHEMA_VERSION,
  type MigrationRegistry,
  SaveError,
} from '../../../src/domain/save';
import { basePayload } from '../../helpers/save-fixtures';

const v1WriteMigration: MigrationRegistry = {
  2: (p) => ({ ...(p as object), worldFlags: { seenA: true } }),
  3: (p) => ({ ...(p as object), inventory: { items: [] } }),
};

describe('WO-013 migrations', () => {
  it('production migrations registry has v1->v2 .. v4->v5 steps at SAVE_SCHEMA_VERSION = 5', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(5);
    expect(Object.keys(Migrations)).toEqual(['2', '3', '4', '5']);
  });

  it('applyMigrations walks s -> s+1 -> ... -> target in exact order (spy)', () => {
    const order: number[] = [];
    const registry: MigrationRegistry = {
      2: (p) => {
        order.push(2);
        return { ...(p as object), v2: true };
      },
      3: (p) => {
        order.push(3);
        return { ...(p as object), v3: true };
      },
      4: (p) => {
        order.push(4);
        return { ...(p as object), v4: true };
      },
      5: (p) => {
        order.push(5);
        return { ...(p as object), v5: true };
      },
    };
    const out = applyMigrations(registry, 1, 5, basePayload());
    expect(order).toEqual([2, 3, 4, 5]);
    expect(out.applied).toEqual([2, 3, 4, 5]);
    expect((out.payload as unknown as Record<string, unknown>)['v5']).toBe(true);
  });

  it('no missing-step shortcut: a missing migration step fails typing', () => {
    const registry: MigrationRegistry = { 3: (p) => p };
    expect(() => applyMigrations(registry, 1, 3, basePayload())).toThrowError(SaveError);
    const out = applyMigrations(v1WriteMigration, 1, 3, basePayload());
    expect(out.applied).toEqual([2, 3]);
  });

  it('schemaVersion at target is a passthrough with no applied steps', () => {
    const out = applyMigrations(v1WriteMigration, 3, 3, basePayload());
    expect(out.applied).toEqual([]);
    expect(out.payload).toBeDefined();
  });

  it('migrations are pure: input payload is not mutated', () => {
    const input = basePayload();
    const frozen = JSON.stringify(input);
    applyMigrations(v1WriteMigration, 1, 3, input);
    expect(JSON.stringify(input)).toBe(frozen);
  });
});
