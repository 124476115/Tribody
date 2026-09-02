/**
 * WO-020 — Save schema v3: progression domain (FS-PROG-001 AC-07 / AC-11).
 *
 * Progression is canonical continuation state, so it joins DialogueSavedState +
 * QuestSavedState + ExplorationSavedState in the authoritative snapshot. This is
 * a real schema bump (v2 → v3) with a pure, content-independent migration, not a
 * redesign of WO-013.
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
import {
  createProgressionState,
  activatePc,
  applyXp,
  xpRequiredToReach,
  type ProgressionSavedState,
} from '../../../src/domain/progression';
import { createSkillsState } from '../../../src/domain/skills';
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

/** A v2 payload (no progression field yet) drawn from the shared fixtures. */
function v2Payload(): SavePayload {
  const rt = combinedRuntime();
  return {
    ...basePayload(),
    domain: {
      dialogue: rt.dialogue,
      quest: rt.quest,
      exploration: rt.exploration,
    } as unknown as SavePayload['domain'],
  };
}

function progressionRuntime(): ProgressionSavedState {
  let p = createProgressionState();
  p = activatePc(p, 'pc_wang');
  p = applyXp(p, { pcId: 'pc_wang', occurrenceId: 'occ-cap', xp: xpRequiredToReach(2) }).state;
  return p;
}

function v5Runtime() {
  const rt = combinedRuntime();
  return {
    dialogue: rt.dialogue,
    quest: rt.quest,
    exploration: rt.exploration,
    progression: progressionRuntime(),
    skills: createSkillsState(),
    inventory: createInventoryState(),
  };
}

describe('WO-020 save schema v3', () => {
  it('SAVE_SCHEMA_VERSION is 5 and the production registry runs v1->v2 .. v4->v5', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(5);
    expect(Object.keys(Migrations)).toEqual(['2', '3', '4', '5']);
  });

  it('AC-11: v2 -> v3 migration seeds canonical initial progression state, content-independent', () => {
    const source = v2Payload();
    const migrated = applyMigrations(Migrations, 2, 3, source);
    expect(migrated.applied).toEqual([3]);
    const progression = (
      migrated.payload.domain as unknown as {
        progression: ProgressionSavedState;
      }
    ).progression;
    // Canonical initial state: empty pcs map (no fabricated PCs), canonical archive.
    expect(progression.pcs).toEqual({});
    expect(progression.archive).toEqual({ discoverableCount: 0, lifetime: {} });
    // The other three domains are untouched.
    expect(migrated.payload.domain.dialogue).toEqual(source.domain.dialogue);
    expect(migrated.payload.domain.quest).toEqual(source.domain.quest);
    expect(migrated.payload.domain.exploration).toEqual(source.domain.exploration);
  });

  it('v3 save/load round-trips progression state (AC-07)', async () => {
    const { port, service } = make();
    const runtime = v5Runtime();
    const saved = await service.saveToSlot('manual-1', runtime as never, ctx());
    expect(saved.status).toBe('ok');

    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('expected ok');
    expect(loaded.runtime.progression).toEqual(progressionRuntime());
    const slot = await port.getSlot('manual-1');
    const record = await port.getRecord(slot?.recordId ?? 'nope');
    expect(record?.schemaVersion).toBe(5);
  });

  it('v2 save loads through the v3 pipeline with canonical seeded progression', async () => {
    const { port, service } = make();
    const pre = v2Payload();
    const record = await finalizeRecord(
      { checksum: (t) => sha256Hex(t) },
      {
        schemaVersion: 2,
        contentVersion: '0.1.0',
        gameVersion: '0.0.1',
        createdAt: 1_700_000_000_000,
        payload: pre,
      }
    );
    await port.createRecord('rid-v2', record);
    await port.putSlot({
      slotId: 'manual-1',
      kind: 'manual',
      recordId: 'rid-v2',
      updatedAt: 1_700_000_000_000,
      loadIssue: null,
      meta: {},
    });
    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('expected ok');
    expect(loaded.runtime.progression.pcs).toEqual({});
    expect(loaded.runtime.progression.archive).toEqual({ discoverableCount: 0, lifetime: {} });
    expect(loaded.runtime.exploration.sceneId).toBe('sc_ch04_lab_morning');
    expect(loaded.record.schemaVersion).toBe(5);
  });

  it('v1 save loads through the v3 pipeline (v1->v2->v3)', async () => {
    const { port, service } = make();
    const rt = combinedRuntime();
    const v1domain = {
      dialogue: rt.dialogue,
      quest: rt.quest,
    } as unknown as SavePayload['domain'];
    const v1: SavePayload = {
      activeChapterId: 'ch_common_04_countdown',
      activeSceneId: 'sc_ch04_lab_morning',
      checkpoint: null,
      playtimeMinutes: 42,
      domain: v1domain,
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
    expect(loaded.runtime.progression).toEqual({
      pcs: {},
      archive: { discoverableCount: 0, lifetime: {} },
    });
  });

  it('v3 guard rejects malformed progression state', async () => {
    const { service } = make();
    const runtime = {
      ...v5Runtime(),
      progression: { pcs: 'not-an-object', archive: null },
    };
    const result = await service.saveToSlot('manual-1', runtime as never, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });

  it('v3 guard rejects a PC with an unknown attribute key', async () => {
    const { service } = make();
    const runtime = v5Runtime();
    runtime.progression = {
      pcs: {
        pc_wang: {
          pcId: 'pc_wang',
          level: 1,
          xp: 0,
          attributes: { intellect: 1, perception: 1, bogus: 7 } as never,
          creditedOccurrences: [],
        },
      },
      archive: { discoverableCount: 0, lifetime: {} },
    };
    const result = await service.saveToSlot('manual-1', runtime as never, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });
});
