/**
 * WO-022 — Save schema v5: inventory domain (FS-INV-001 AC-07/AC-08).
 *
 * Inventory is canonical continuation state, so it joins dialogue + quest +
 * exploration + progression + skills in the authoritative snapshot — a real
 * schema bump (v4 → v5) with a pure, content-independent migration that must
 * leave every other domain byte-identical.
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
  SaveError,
  SAVE_SCHEMA_VERSION,
  type SavePayload,
} from '../../../src/domain/save';
import {
  createInventoryState,
  addItem,
  equipItem,
  type InventorySavedState,
} from '../../../src/domain/inventory';
import { createSkillsState, learnSkill } from '../../../src/domain/skills';
import { createProgressionState } from '../../../src/domain/progression';
import { MemoryPersistence } from '../../helpers/memory-persistence';
import { combinedRuntime, fixtureCatalog, basePayload } from '../../helpers/save-fixtures';
import type { SaveDomain } from '../../../src/application/save';

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

/** A v4 payload (no inventory field yet) drawn from the shared fixtures. */
function v4Payload(): SavePayload {
  const rt = combinedRuntime();
  return {
    ...basePayload(),
    domain: {
      dialogue: rt.dialogue,
      quest: rt.quest,
      exploration: rt.exploration,
      progression: createProgressionState(),
      skills: createSkillsState(),
    } as unknown as SavePayload['domain'],
  };
}

function inventoryRuntime(): InventorySavedState {
  let inv = createInventoryState();
  inv = addItem(inv, {
    itemId: 'item_tool_relay_scanner',
    occurrenceId: 'occ-g1',
    stackable: false,
  }).state;
  inv = addItem(inv, {
    itemId: 'item_consumable_notch',
    occurrenceId: 'occ-g2',
    stackable: true,
    count: 3,
  }).state;
  inv = equipItem(inv, { itemId: 'item_tool_relay_scanner', slot: 'tool' }).state;
  return inv;
}

function currentRuntime(): SaveDomain {
  const rt = combinedRuntime();
  return {
    dialogue: rt.dialogue,
    quest: rt.quest,
    exploration: rt.exploration,
    progression: rt.progression,
    skills: learnSkill(createSkillsState(), {
      pcId: 'pc_wang',
      skillId: 'skill_scientist_experimental_design',
      occurrenceId: 'occ-design',
    }).state,
    inventory: inventoryRuntime(),
  };
}

describe('WO-022 save schema v5', () => {
  it('SAVE_SCHEMA_VERSION is 5 and the production registry has v1->v2 .. v4->v5 steps', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(5);
    expect(Object.keys(Migrations)).toEqual(['2', '3', '4', '5']);
  });

  it('AC-08: v4 -> v5 migration seeds canonical empty inventory, content-independent, other five domains untouched', () => {
    const source = v4Payload();
    const migrated = applyMigrations(Migrations, 4, 5, source);
    expect(migrated.applied).toEqual([5]);
    const inventory = (migrated.payload.domain as unknown as { inventory: InventorySavedState })
      .inventory;
    expect(inventory).toEqual({ items: {}, equipped: {}, ledger: [] });
    expect(migrated.payload.domain.dialogue).toEqual(source.domain.dialogue);
    expect(migrated.payload.domain.quest).toEqual(source.domain.quest);
    expect(migrated.payload.domain.exploration).toEqual(source.domain.exploration);
    expect(migrated.payload.domain.progression).toEqual(source.domain.progression);
    expect(migrated.payload.domain.skills).toEqual(source.domain.skills);
  });

  it('AC-08: a v4 snapshot that already carries inventory is corrupt-shape', () => {
    const source = v4Payload();
    const tampered = JSON.parse(JSON.stringify(source)) as SavePayload;
    (tampered.domain as unknown as Record<string, unknown>)['inventory'] = {
      items: {},
      equipped: {},
      ledger: [],
    };
    expect(() => applyMigrations(Migrations, 4, 5, tampered)).toThrow(SaveError);
  });

  it('AC-08: v1 save loads through the v5 pipeline (v1->v2->v3->v4->v5)', async () => {
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
    expect(loaded.runtime.inventory).toEqual({ items: {}, equipped: {}, ledger: [] });
    expect(loaded.runtime.skills).toEqual({ pcs: {} });
  });

  it('AC-07: equip + stacks survive a full save/load round-trip byte-stable', async () => {
    const { port, service } = make();
    const saved = await service.saveToSlot('manual-1', currentRuntime(), ctx());
    expect(saved.status).toBe('ok');
    if (saved.status !== 'ok') throw new Error('expected ok');

    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('expected ok');
    expect(loaded.runtime.inventory).toEqual(inventoryRuntime());
    const slot = await port.getSlot('manual-1');
    const record = await port.getRecord(slot?.recordId ?? 'nope');
    expect(record?.schemaVersion).toBe(5);
  });

  it('AC-07: a v4 save loads through the v5 pipeline and gets a canonical inventory', async () => {
    const { port, service } = make();
    const pre = v4Payload();
    const record = await finalizeRecord(
      { checksum: (t) => sha256Hex(t) },
      {
        schemaVersion: 4,
        contentVersion: '0.1.0',
        gameVersion: '0.0.1',
        createdAt: 1_700_000_000_000,
        payload: pre,
      }
    );
    await port.createRecord('rid-v4', record);
    await port.putSlot({
      slotId: 'manual-1',
      kind: 'manual',
      recordId: 'rid-v4',
      updatedAt: 1_700_000_000_000,
      loadIssue: null,
      meta: {},
    });
    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('expected ok');
    expect(loaded.runtime.inventory).toEqual({ items: {}, equipped: {}, ledger: [] });
    expect(loaded.record.schemaVersion).toBe(5);
  });

  it('AC-08: v5 guard rejects a stored item whose key differs from its itemId', async () => {
    const { service } = make();
    const runtime = currentRuntime();
    const inv = runtime.inventory as unknown as { items: Record<string, unknown> };
    inv.items = { item_tool_relay_scanner: { itemId: 'item_other', count: 1 } };
    const result = await service.saveToSlot('manual-1', runtime, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });

  it('AC-08: v5 guard rejects non-positive structural counts', async () => {
    const { service } = make();
    const runtime = currentRuntime();
    const inv = runtime.inventory as unknown as { items: Record<string, unknown> };
    inv.items = { item_tool_relay_scanner: { itemId: 'item_tool_relay_scanner', count: 0 } };
    const result = await service.saveToSlot('manual-1', runtime, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });

  it('AC-08: v5 guard rejects an equipped value that is not owned', async () => {
    const { service } = make();
    const runtime = currentRuntime();
    runtime.inventory = {
      ...createInventoryState(),
      equipped: { tool: 'item_tool_relay_scanner' } as InventorySavedState['equipped'],
    };
    const result = await service.saveToSlot('manual-1', runtime, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });

  it('AC-08: v5 guard rejects a non-canonical equipment slot key', async () => {
    const { service } = make();
    const runtime = currentRuntime();
    runtime.inventory = {
      ...createInventoryState(),
      equipped: { weapon: 'item_tool_relay_scanner' } as never,
    };
    const result = await service.saveToSlot('manual-1', runtime, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });

  it('AC-08: v5 guard rejects a malformed ledger entry', async () => {
    const { service } = make();
    const runtime = currentRuntime();
    runtime.inventory = { ...createInventoryState(), ledger: ['nonsense'] as never };
    const result = await service.saveToSlot('manual-1', runtime, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });

  it('AC-08: v5 guard rejects an item id that violates the item grammar', async () => {
    const { service } = make();
    const runtime = currentRuntime();
    runtime.inventory = {
      items: { whats_this: { itemId: 'whats_this', count: 1 } },
      equipped: {},
      ledger: [],
    };
    const result = await service.saveToSlot('manual-1', runtime, ctx());
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.code).toBe('corrupt-shape');
  });
});
