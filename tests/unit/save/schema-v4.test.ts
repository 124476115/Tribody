/**
 * WO-021 — Save schema v4: skills domain (FS-SKILL-001 AC-05 / AC-06).
 *
 * Skills is canonical continuation state, so it joins dialogue + quest +
 * exploration + progression in the authoritative snapshot — a real schema bump
 * (v3 → v4) with a pure, content-independent migration, not a redesign of
 * WO-013, WO-014, or WO-020.
 */
import { describe, it, expect } from 'vitest';
import {
  SaveService,
  finalizeRecord,
  type SaveServiceOptions,
} from '../../../src/application/save';
import { sha256Hex } from '../../../src/adapters/persistence';
import {
  applyMigrations,
  Migrations,
  SAVE_SCHEMA_VERSION,
  type SavePayload,
} from '../../../src/domain/save';
import { createSkillsState, learnSkill, type SkillsSavedState } from '../../../src/domain/skills';
import { createProgressionState } from '../../../src/domain/progression';
import { createInventoryState } from '../../../src/domain/inventory';
import { MemoryPersistence } from '../../helpers/memory-persistence';
import { combinedRuntime, fixtureCatalog, basePayload } from '../../helpers/save-fixtures';

function make(opts: Partial<SaveServiceOptions> = {}): {
  port: MemoryPersistence;
  service: SaveService;
} {
  const port = new MemoryPersistence();
  const service = new SaveService({
    persistence: port,
    checksummer: { checksum: (t) => sha256Hex(t) },
    clock: { now: () => 1000 },
    catalog: fixtureCatalog(),
    ...opts,
  });
  return { port, service };
}

function ctx(overrides: Partial<Parameters<SaveService['saveToSlot']>[2]> = {}) {
  return {
    contentVersion: '0.1.0',
    activeChapterId: 'ch_common_04_countdown',
    activeSceneId: 'sc_ch04_lab_morning',
    playtimeMinutes: 42,
    checkpoint: null,
    ...overrides,
  };
}

/** A v3 payload (no skills field yet) drawn from the shared fixtures. */
function v3Payload(): SavePayload {
  const rt = combinedRuntime();
  return {
    ...basePayload(),
    domain: {
      dialogue: rt.dialogue,
      quest: rt.quest,
      exploration: rt.exploration,
      progression: createProgressionState(),
    } as unknown as SavePayload['domain'],
  };
}

function skillsRuntime(): SkillsSavedState {
  let s = createSkillsState();
  s = learnSkill(s, {
    pcId: 'pc_wang',
    skillId: 'skill_scientist_experimental_design',
    occurrenceId: 'occ-design',
  }).state;
  return s;
}

function v5Runtime() {
  const rt = combinedRuntime();
  return {
    dialogue: rt.dialogue,
    quest: rt.quest,
    exploration: rt.exploration,
    progression: createProgressionState(),
    skills: skillsRuntime(),
    inventory: createInventoryState(),
  };
}

describe('WO-021/022 save schema v4 -> v5', () => {
  it('SAVE_SCHEMA_VERSION is 5 and the production registry runs v1->v2 .. v4->v5', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(5);
    expect(Object.keys(Migrations)).toEqual(['2', '3', '4', '5']);
  });

  it('AC-05: v3 -> v4 migration seeds canonical initial skills state, content-independent', () => {
    const source = v3Payload();
    const migrated = applyMigrations(Migrations, 3, 4, source);
    expect(migrated.applied).toEqual([4]);
    const skills = (migrated.payload.domain as unknown as { skills: SkillsSavedState }).skills;
    expect(skills).toEqual({ pcs: {} });
    // The other four domains are untouched.
    expect(migrated.payload.domain.dialogue).toEqual(source.domain.dialogue);
    expect(migrated.payload.domain.quest).toEqual(source.domain.quest);
    expect(migrated.payload.domain.exploration).toEqual(source.domain.exploration);
    expect(migrated.payload.domain.progression).toEqual(source.domain.progression);
  });

  it('AC-05: v4 save/load round-trips skills state', async () => {
    const { port, service } = make();
    const saved = await service.saveToSlot('manual-1', v5Runtime() as never, ctx());
    expect(saved.status).toBe('ok');

    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('expected ok');
    expect(loaded.runtime.skills).toEqual(skillsRuntime());
    const slot = await port.getSlot('manual-1');
    const record = await port.getRecord(slot?.recordId ?? 'nope');
    expect(record?.schemaVersion).toBe(5);
  });

  it('AC-05: v3 save loads through the v4 pipeline with canonical seeded skills', async () => {
    const { port, service } = make();
    const pre = v3Payload();
    const record = await finalizeRecord(
      { checksum: (t) => sha256Hex(t) },
      {
        schemaVersion: 3,
        contentVersion: '0.1.0',
        gameVersion: '0.0.1',
        createdAt: 1_700_000_000_000,
        payload: pre,
      }
    );
    await port.createRecord('rid-v3', record);
    await port.putSlot({
      slotId: 'manual-1',
      kind: 'manual',
      recordId: 'rid-v3',
      updatedAt: 1_700_000_000_000,
      loadIssue: null,
      meta: {},
    });
    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('expected ok');
    expect(loaded.runtime.skills).toEqual({ pcs: {} });
    expect(loaded.runtime.progression.pcs).toEqual({});
    expect(loaded.record.schemaVersion).toBe(5);
  });

  it('v1 save loads through the v4 pipeline (v1->v2->v3->v4)', async () => {
    const { port, service } = make();
    const rt = combinedRuntime();
    const v1: SavePayload = {
      ...basePayload(),
      domain: {
        dialogue: rt.dialogue,
        quest: rt.quest,
      } as unknown as SavePayload['domain'],
    };
    const record = await finalizeRecord(
      { checksum: (t) => sha256Hex(t) },
      {
        schemaVersion: 1,
        contentVersion: '0.1.0',
        gameVersion: '0.0.1',
        createdAt: 1_700_000_000_000,
        payload: v1,
      }
    );
    await port.createRecord('rid-v1', record);
    await port.putSlot({
      slotId: 'manual-1',
      kind: 'manual',
      recordId: 'rid-v1',
      updatedAt: 1_700_000_000_000,
      loadIssue: null,
      meta: {},
    });
    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('expected ok');
    expect(loaded.record.schemaVersion).toBe(5);
    expect(loaded.runtime.skills).toEqual({ pcs: {} });
  });

  it('AC-06: v4 guard rejects skill keys outside the canonical 20-skill set', async () => {
    const { service } = make();
    const runtime = v5Runtime();
    runtime.skills = {
      pcs: {
        pc_wang: {
          pcId: 'pc_wang',
          values: { skill_science_unknown: 1 } as never,
          learnLedger: [],
        },
      },
    };
    const result = await service.saveToSlot('manual-1', runtime as never, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });

  it('AC-06: v4 guard rejects skill values outside exactly 0|1', async () => {
    const { service } = make();
    const runtime = v5Runtime();
    runtime.skills = {
      pcs: {
        pc_wang: {
          pcId: 'pc_wang',
          values: { skill_scientist_experimental_design: 2 } as never,
          learnLedger: [],
        },
      },
    };
    const result = await service.saveToSlot('manual-1', runtime as never, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });

  it('AC-06: v4 guard rejects a pc whose map key differs from its pcId', async () => {
    const { service } = make();
    const runtime = v5Runtime();
    runtime.skills = {
      pcs: {
        pc_wang: {
          pcId: 'pc_other',
          values: { skill_scientist_experimental_design: 1 },
          learnLedger: [],
        },
      },
    };
    const result = await service.saveToSlot('manual-1', runtime as never, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });

  it('AC-06: v4 guard rejects a malformed learn ledger', async () => {
    const { service } = make();
    const runtime = v5Runtime();
    runtime.skills = {
      pcs: {
        pc_wang: {
          pcId: 'pc_wang',
          values: { skill_scientist_experimental_design: 1 },
          learnLedger: 'occ-1' as never,
        },
      },
    };
    const result = await service.saveToSlot('manual-1', runtime as never, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });
});
