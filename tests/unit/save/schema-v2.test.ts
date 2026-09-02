/**
 * WO-014 — Save schema v2: exploration state.
 *
 * Exploration now owns canonical continuation state, so it joins
 * DialogueSavedState + QuestSavedState in the authoritative snapshot. This is
 * the schema-evolution path reserved by WO-013/FS-SAVE-001 ("future schema
 * versions + migration"), NOT a redesign of WO-013.
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
import type { ExplorationSavedState } from '../../../src/domain/exploration';
import { createExplorationState } from '../../../src/domain/exploration';
import { createDialogueDomain } from '../../../src/domain/dialogue';
import { createQuestDomain } from '../../../src/domain/quest';
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

/**
 * v2-shaped domain (no progression) for the target=2 behavior tests: the v2
 * guard requires exactly {dialogue, quest, exploration}.
 */
function runtimeDomain() {
  const rt = combinedRuntime();
  return {
    dialogue: rt.dialogue,
    quest: rt.quest,
    exploration: rt.exploration,
  };
}

/** The legacy v1 payload shape (real dialogue+quest runtime, no exploration). */
function v1Payload(): SavePayload {
  const rt = combinedRuntime();
  return {
    ...basePayload(),
    domain: { dialogue: rt.dialogue, quest: rt.quest } as unknown as SavePayload['domain'],
  };
}

function v2Payload(exploration: ExplorationSavedState): SavePayload {
  const domain = {
    dialogue: createDialogueDomain(),
    quest: createQuestDomain(),
    exploration,
  };
  return {
    activeChapterId: 'ch_common_04_countdown',
    activeSceneId: exploration.sceneId,
    checkpoint: {
      chapterId: 'ch_common_04_countdown',
      sceneId: exploration.sceneId,
      scope: 'manual',
    },
    playtimeMinutes: 1,
    domain: domain as unknown as SavePayload['domain'],
  };
}

describe('WO-014 save schema v2 (historical) at v3', () => {
  it('v1->v2 migration step remains in the production registry (v2 is not the latest)', () => {
    // Schema is now v3; WO-020 pins the current version and full registry.
    // This file guards the v1->v2 step specifically so it is not lost.
    expect(Object.keys(Migrations)).toContain('2');
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThan(2);
  });

  it('v1Payload omits exploration (fixture sanity)', () => {
    expect((v1Payload().domain as Record<string, unknown>)['exploration']).toBeUndefined();
  });

  it('production v1 -> v2 migration adds a legacy exploration state and leaves dialogue/quest identical', () => {
    const source = v1Payload();
    const preDialogue = JSON.stringify(source.domain.dialogue);
    const preQuest = JSON.stringify(source.domain.quest);
    const migrated = applyMigrations(Migrations, 1, 2, source);
    expect(migrated.applied).toEqual([2]);
    const exploration = (migrated.payload.domain as { exploration: ExplorationSavedState })
      .exploration;
    // Migrated v1 resumes the persisted active scene via the legacy entry rule —
    // no invented coordinates.
    expect(exploration.sceneId).toBe(source.activeSceneId);
    expect(JSON.stringify(migrated.payload.domain.dialogue)).toBe(preDialogue);
    expect(JSON.stringify(migrated.payload.domain.quest)).toBe(preQuest);
  });

  it('v2 guard rejects malformed exploration state', async () => {
    const { service } = make({ target: 2 });
    const runtime = {
      ...runtimeDomain(),
      exploration: { sceneId: 42, position: { x: 0, y: 0 }, visitedScenes: [] },
    };
    const result = await service.saveToSlot('manual-1', runtime as never, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });

  it('v2 save/load round-trips exploration position + scene continuation', async () => {
    const { port, service } = make({ target: 2 });
    const exploration = createExplorationState();
    exploration.sceneId = 'sc_ch04_lab_morning';
    exploration.position = { x: 4, y: 2 };
    exploration.visitedScenes = ['sc_ch04_lab_morning'];
    const runtime = { ...runtimeDomain(), exploration };
    const saved = await service.saveToSlot('manual-1', runtime as never, ctx());
    expect(saved.status).toBe('ok');

    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('expected ok');
    expect(loaded.runtime.exploration).toEqual({
      sceneId: 'sc_ch04_lab_morning',
      position: { x: 4, y: 2 },
      visitedScenes: ['sc_ch04_lab_morning'],
    });
    const slot = await port.getSlot('manual-1');
    const record = await port.getRecord(slot?.recordId ?? 'nope');
    expect(record?.schemaVersion).toBe(2);
  });

  it('checksum changes when exploration state changes (identical dialogue/quest)', async () => {
    const a = createExplorationState();
    a.sceneId = 'sc_ch04_lab_morning';
    a.position = { x: 0, y: 0 };
    const b = { ...a, position: { x: 1, y: 1 } };
    const chk = { checksum: (t: string) => sha256Hex(t) };
    const recA = await finalizeRecord(chk, {
      schemaVersion: 2,
      contentVersion: '0.1.0',
      gameVersion: '0.0.1',
      createdAt: 1,
      payload: v2Payload(a),
    });
    const recB = await finalizeRecord(chk, {
      schemaVersion: 2,
      contentVersion: '0.1.0',
      gameVersion: '0.0.1',
      createdAt: 1,
      payload: v2Payload(b),
    });
    expect(recA.checksum).not.toBe(recB.checksum);
  });

  it('v1 save loads through the v2 pipeline and resumes the persisted scene via legacy exploration', async () => {
    const { port, service } = make();
    const pre = v1Payload();
    const record = await finalizeRecord(
      { checksum: (t) => sha256Hex(t) },
      {
        schemaVersion: 1,
        contentVersion: '0.1.0',
        gameVersion: '0.0.1',
        createdAt: 1_700_000_000_000,
        payload: pre,
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
    expect(loaded.runtime.exploration.sceneId).toBe('sc_ch04_lab_morning');
    expect(loaded.runtime.quest.quests['q_ramp']?.status).toBe('active');
  });

  it('v2 guard rejects a contradictory scene (exploration.sceneId != activeSceneId)', async () => {
    const { service } = make();
    const exploration = createExplorationState();
    exploration.sceneId = 'sc_other';
    exploration.position = { x: 0, y: 0 };
    const runtime = { ...runtimeDomain(), exploration };
    const result = await service.saveToSlot('manual-1', runtime as never, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });
});
