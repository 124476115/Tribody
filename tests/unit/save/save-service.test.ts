/**
 * WO-013 SaveService — save/load lifecycle against a MemoryPersistence port.
 *
 * AC-01 roundtrip, slot model, immutability, interrupted-write recovery,
 * rotation, loadIssue markers, import/export atomicity and migration-persist
 * fallback (best-effort persist, always 'ok' load).
 */
import { describe, it, expect } from 'vitest';
import {
  SaveService,
  finalizeRecord,
  type SaveDomain,
  type SaveServiceOptions,
  type MigrationRegistry,
  type PipelineGuard,
} from '../../../src/application/save';
import { sha256Hex } from '../../../src/adapters/persistence';
import { SaveError, type SaveSlotDoc } from '../../../src/domain/save';
import { MemoryPersistence } from '../../helpers/memory-persistence';
import {
  combinedRuntime,
  fixtureCatalog,
  basePayload,
  domainOf,
} from '../../helpers/save-fixtures';

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

function runtimeDomain() {
  const rt = combinedRuntime();
  return domainOf(rt);
}

function autosaveDocs(port: MemoryPersistence): SaveSlotDoc[] {
  return [...port.slots.values()].sort(
    (a, b) => a.updatedAt - b.updatedAt || a.slotId.localeCompare(b.slotId)
  );
}

async function tamperAutosaveRecord(port: MemoryPersistence, recordId: string): Promise<void> {
  const rec = await port.getRecord(recordId);
  const tampered = JSON.parse(JSON.stringify(rec)) as NonNullable<typeof rec>;
  (tampered.payload as unknown as Record<string, unknown>)['activeChapterId'] = 'ch_tampered';
  await port.records.set(recordId, tampered);
}

describe('WO-013 SaveService', () => {
  it('AC-01: save round-trips to an identical, playable runtime', async () => {
    const { port, service } = make();
    const saved = await service.saveToSlot('manual-1', runtimeDomain(), ctx());
    expect(saved.status).toBe('ok');
    if (saved.status !== 'ok') throw new Error('x');

    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('x');
    expect(loaded.warnings).toEqual([]);
    expect(loaded.runtime.dialogue.active?.mode).toBe('awaitingSkillCheck');
    expect(loaded.runtime.dialogue.active?.pendingCheck?.choiceId).toBe('c_skill');
    expect(loaded.runtime.dialogue.processedRequestIds).toEqual([
      'ReqStart',
      'ReqSelB',
      'ReqSelSkill',
    ]);
    const ramp = loaded.runtime.quest.quests['q_ramp'];
    expect(ramp).toBeDefined();
    expect(ramp?.processedEventIds).toEqual(['evt-shared']);
    expect(loaded.runtime.quest.quests['q_watched']?.status).toBe('resolved_success');

    // The record is stored with a live checksum, not PLACEHOLDER.
    const slot = await port.getSlot('manual-1');
    expect(slot?.loadIssue).toBeNull();
    const record = await port.getRecord(slot?.recordId ?? 'nope');
    expect(record?.checksum).not.toBe('PLACEHOLDER');
    expect(record?.payload.domain.quest.quests['q_ramp']?.status).toBe('active');
  });

  it('records are immutable and one save produces exactly one new record id', async () => {
    const { port, service } = make();
    const before = await port.listRecordIds();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await service.saveToSlot('manual-1', runtimeDomain(), ctx());
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') throw new Error('x');
      ids.push(r.slot.recordId);
    }
    expect(new Set(ids).size).toBe(3);
    const after = await port.listRecordIds();
    expect(after.length).toBe(before.length + 3);
    after.forEach((id) => expect(port.records.has(id)).toBe(true));
    const slot = await port.getSlot('manual-1');
    expect(slot?.recordId).toBe(ids[2]);
    expect(port.orphanRecordIds()).toEqual([ids[0], ids[1]]); // old versions GC-eligible, still intact
    for (const id of ids) {
      const kept = port.records.get(id);
      expect(kept?.checksum).not.toBe('PLACEHOLDER');
    }
  });

  it('port-level collision reducers fail typed as persistence-collision and leave the original intact', async () => {
    const { port, service } = make();
    const r = await service.saveToSlot('manual-1', runtimeDomain(), ctx());
    if (r.status !== 'ok') throw new Error('x');
    const original = await port.getRecord(r.slot.recordId);
    const dup = JSON.parse(JSON.stringify(original)) as NonNullable<typeof original>;
    await expect(port.createRecord(r.slot.recordId, dup)).rejects.toMatchObject({
      code: 'persistence-collision',
    });
    const still = await port.getRecord(r.slot.recordId);
    expect(still?.checksum).toBe(original?.checksum);
  });

  it('interrupted write falls back to the previous valid slot and leaves no orphan', async () => {
    const { port, service } = make();
    const first = await service.saveToSlot(
      'manual-1',
      runtimeDomain(),
      ctx({ playtimeMinutes: 1 })
    );
    if (first.status !== 'ok') throw new Error('x');
    const priorRecord = await port.getRecord(first.slot.recordId);
    const priorPointer = (await port.getSlot('manual-1'))?.recordId;
    expect(priorPointer).toBe(first.slot.recordId);

    port.faults.failNextPutSlot = true;
    const second = await service.saveToSlot(
      'manual-1',
      runtimeDomain(),
      ctx({ playtimeMinutes: 2 })
    );
    expect(second.status).toBe('error');
    if (second.status !== 'error') throw new Error('x');
    expect(second.error.code).toBe('persistence-error');

    // Pointer write failed after the record was created: the destination slot
    // pointer and the previous record must be byte-identical to before.
    expect((await port.getSlot('manual-1'))?.recordId).toBe(priorPointer);
    expect(await port.getRecord(first.slot.recordId)).toEqual(priorRecord);

    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('x');
    expect(loaded.runtime.quest.quests['q_ramp']?.status).toBe('active');
    expect(port.orphanRecordIds()).toEqual([]); // best-effort delete of the orphan
  });

  it('manual slots are isolated; deleteSlot only removes the target slot', async () => {
    const { port, service } = make();
    await service.saveToSlot('manual-1', runtimeDomain(), ctx());
    const m2 = await service.saveToSlot('manual-2', runtimeDomain(), ctx());
    expect(m2.status).toBe('ok');
    await service.saveToSlot('manual-2', runtimeDomain(), ctx());

    expect(await port.listSlots()).toHaveLength(2);
    const del = await service.deleteSlot('manual-2');
    expect(del.status).toBe('ok');
    const one = await service.loadSlot('manual-1');
    expect(one.status).toBe('ok');
    const gone = await service.loadSlot('manual-2');
    expect(gone.status).toBe('error');
    if (gone.status !== 'error') throw new Error('x');
    expect(gone.error.code).toBe('slot-not-found');
  });

  it('autosave: cap at 5, evict the smallest (updatedAt, slotId), never a manual slot', async () => {
    let t = 1000;
    const { port, service } = make({ clock: { now: () => t } });
    const produced: Record<string, string> = {};
    for (let i = 0; i < 6; i += 1) {
      t += 1;
      const r = await service.autosave(runtimeDomain(), ctx());
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') throw new Error('x');
      produced[`a${i + 1}`] = r.slot.recordId;
    }
    const slots = (await port.listSlots()).sort((a, b) => a.slotId.localeCompare(b.slotId));
    expect(slots).toHaveLength(5);
    expect(slots.every((s) => s.kind === 'autosave')).toBe(true);
    const docById = Object.fromEntries(slots.map((s) => [s.slotId, s]));
    expect(docById['auto-5']?.updatedAt).toBe(1005); // oldest prefix kept
    expect(docById['auto-1']?.updatedAt).toBe(1006); // newest save is auto-1 again
    expect(docById['auto-1']?.recordId).toBe(produced['a6']);
  });

  it('tie-break: with equal updatedAt the smallest slotId is evicted', async () => {
    const { port, service } = make({ clock: { now: () => 1000 } });
    for (let i = 0; i < 6; i += 1) {
      const r = await service.autosave(runtimeDomain(), ctx());
      expect(r.status).toBe('ok');
    }
    const slots = (await port.listSlots()).sort((a, b) => a.slotId.localeCompare(b.slotId));
    expect(slots).toHaveLength(5);
    const ids = slots.map((s) => s.recordId);
    expect(new Set(ids).size).toBe(5);
    const allAfterNonevicted = await service.autosave(runtimeDomain(), ctx());
    expect(allAfterNonevicted.status).toBe('ok');
    expect(await port.listSlots()).toHaveLength(5);
  });

  it('loadIssue: corrupt-checksum is recorded on the next load and cleared by a good save', async () => {
    const { port, service } = make();
    const r = await service.saveToSlot('manual-1', runtimeDomain(), ctx());
    if (r.status !== 'ok') throw new Error('x');

    const original = await port.getRecord(r.slot.recordId);
    if (!original) throw new Error('x');
    const tampered = JSON.parse(JSON.stringify(original)) as typeof original;
    (tampered.payload as unknown as Record<string, unknown>)['activeChapterId'] = 'ch_tampered';
    await port.records.set(r.slot.recordId, tampered);

    const loaded1 = await service.loadSlot('manual-1');
    expect(loaded1.status).toBe('error');
    if (loaded1.status !== 'error') throw new Error('x');
    expect(loaded1.error.code).toBe('corrupt-checksum');

    const slot = await port.getSlot('manual-1');
    expect(slot?.loadIssue).toEqual({
      code: 'corrupt-checksum',
      message: expect.stringMatching(/corrupt-checksum|checksum/i),
    });

    const again = await service.loadSlot('manual-1');
    expect(again.status).toBe('error');
    if (again.status !== 'error') throw new Error('x');
    expect(again.error.code).toBe('corrupt-checksum');

    const good = await service.saveToSlot('manual-1', runtimeDomain(), ctx());
    expect(good.status).toBe('ok');
    if (good.status !== 'ok') throw new Error('x');
    const after = await port.getSlot('manual-1');
    expect(after?.loadIssue).toBeNull();
  });

  it('AC-03: corrupt newest autosave falls back to the next-newest valid runtime', async () => {
    let t = 1000;
    const { port, service } = make({ clock: { now: () => t } });
    for (let i = 1; i <= 4; i += 1) {
      t += 1;
      const r = await service.autosave(runtimeDomain(), ctx({ playtimeMinutes: i }));
      expect(r.status).toBe('ok');
    }
    const docs = autosaveDocs(port);
    expect(docs.map((d) => d.updatedAt)).toEqual([1001, 1002, 1003, 1004]);
    await tamperAutosaveRecord(port, (docs[3] as SaveSlotDoc).recordId); // newest corrupt

    const best = await service.loadBestAutosave();
    expect(best.status).toBe('ok');
    if (best.status !== 'ok') throw new Error('x');
    expect(best.record.payload.playtimeMinutes).toBe(3);
    expect(port.orphanRecordIds()).toEqual([]);
  });

  it('AC-03: skips several corrupt autosaves and lands on the newest still-valid one', async () => {
    let t = 1000;
    const { port, service } = make({ clock: { now: () => t } });
    for (let i = 1; i <= 5; i += 1) {
      t += 1;
      const r = await service.autosave(runtimeDomain(), ctx({ playtimeMinutes: i }));
      expect(r.status).toBe('ok');
    }
    const docs = autosaveDocs(port);
    for (const doc of docs.slice(2)) await tamperAutosaveRecord(port, doc.recordId); // 3,4,5

    const best = await service.loadBestAutosave();
    expect(best.status).toBe('ok');
    if (best.status !== 'ok') throw new Error('x');
    expect(best.record.payload.playtimeMinutes).toBe(2);
  });

  it('AC-03: equal updatedAt tie breaks deterministically by (updatedAt, slotId)', async () => {
    const { port, service } = make({ clock: { now: () => 1000 } });
    const first = await service.autosave(runtimeDomain(), ctx({ playtimeMinutes: 1 }));
    const second = await service.autosave(runtimeDomain(), ctx({ playtimeMinutes: 2 }));
    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    const docs = autosaveDocs(port).reverse(); // newest first; hi slotId wins ties
    expect(docs.map((d) => d.slotId)).toEqual(['auto-2', 'auto-1']);
    await tamperAutosaveRecord(port, (docs[0] as SaveSlotDoc).recordId); // corrupt "newest"

    const best = await service.loadBestAutosave();
    expect(best.status).toBe('ok');
    if (best.status !== 'ok') throw new Error('x');
    expect(best.record.payload.playtimeMinutes).toBe(1);
  });

  it('AC-03: all autosaves corrupt returns a typed slot-not-found, not a bare throw', async () => {
    let t = 1000;
    const { port, service } = make({ clock: { now: () => t } });
    for (let i = 1; i <= 3; i += 1) {
      t += 1;
      const r = await service.autosave(runtimeDomain(), ctx());
      expect(r.status).toBe('ok');
    }
    for (const doc of autosaveDocs(port)) await tamperAutosaveRecord(port, doc.recordId);
    const best = await service.loadBestAutosave();
    expect(best.status).toBe('error');
    if (best.status !== 'error') throw new Error('x');
    expect(best.error.code).toBe('slot-not-found');
  });

  it('AC-03: no autosaves available returns a typed slot-not-found', async () => {
    const { service } = make();
    const best = await service.loadBestAutosave();
    expect(best.status).toBe('error');
    if (best.status !== 'error') throw new Error('x');
    expect(best.error.code).toBe('slot-not-found');
  });

  it('a checksum-verified unsupported schema is loadIssue unsupported-schema, not corrupt', async () => {
    const { port, service } = make();
    const finalized = await finalizeRecord(
      { checksum: (t) => sha256Hex(t) },
      {
        schemaVersion: 999,
        contentVersion: '0.1.0',
        gameVersion: '0.0.1',
        createdAt: 1_700_000_000_000,
        payload: { ...basePayload(), domain: runtimeDomain() },
      }
    );
    await port.createRecord('rid-999', finalized);
    await port.putSlot({
      slotId: 'manual-1',
      kind: 'manual',
      recordId: 'rid-999',
      updatedAt: 1_700_000_000_000,
      loadIssue: null,
      meta: {},
    });
    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('error');
    if (loaded.status !== 'error') throw new Error('x');
    if (loaded.error.code !== 'unsupported-schema') throw new Error('expected unsupported-schema');
    const doc = await port.getSlot('manual-1');
    expect(doc?.loadIssue?.code).toBe('unsupported-schema');
  });

  it('migration: an old valid save migrates, and persist failure stays an ok load with a warning', async () => {
    const guards: Record<number, PipelineGuard> = {
      1: () => undefined,
      2: (p: unknown) => {
        const o = p as Record<string, unknown>;
        if (!o['worldFlags']) throw new SaveError('corrupt-shape', 'v2 guard');
      },
      3: (p: unknown) => {
        const o = p as Record<string, unknown>;
        if (!o['worldFlags'] || !o['inventory']) throw new SaveError('corrupt-shape', 'v3 guard');
      },
    };
    const migrations: MigrationRegistry = {
      2: (p) => ({ ...(p as object), worldFlags: { seen: [] } }),
      3: (p) => ({ ...(p as object), inventory: { items: [] } }),
    };

    const { port } = make();
    const rt = combinedRuntime();
    const v1domain = { dialogue: rt.dialogue, quest: rt.quest } as unknown as SaveDomain;
    const v1 = new SaveService({
      persistence: port,
      checksummer: { checksum: (t) => sha256Hex(t) },
      clock: { now: () => 1000 },
      catalog: fixtureCatalog(),
      target: 1,
    });
    const first = await v1.saveToSlot('manual-1', v1domain, ctx());
    if (first.status !== 'ok') throw new Error('x');
    const oldRecordId = first.slot.recordId;

    const migrator = new SaveService({
      persistence: port,
      checksummer: { checksum: (t) => sha256Hex(t) },
      clock: { now: () => 2000 },
      catalog: fixtureCatalog(),
      target: 3,
      guards,
      migrations,
    });
    port.faults.failNextCreateRecord = true;
    const w = await migrator.loadSlot('manual-1');
    expect(w.status).toBe('ok');
    if (w.status !== 'ok') throw new Error('x');
    expect(w.warnings.map((x) => x.code)).toContain('migration-record-not-persisted');
    expect(w.runtime.dialogue.active?.mode).toBe('awaitingSkillCheck');
    const docStill = await port.getSlot('manual-1');
    expect(docStill?.recordId).toBe(oldRecordId); // old slot untouched

    const ok2 = await migrator.loadSlot('manual-1');
    expect(ok2.status).toBe('ok');
    if (ok2.status !== 'ok') throw new Error('x');
    expect(ok2.warnings).toEqual([]);
    const doc = await port.getSlot('manual-1');
    expect(doc?.recordId).not.toBe(oldRecordId);
    const migrated = await port.getRecord(doc?.recordId ?? 'nope');
    const migratedPayload = migrated?.payload as unknown as {
      worldFlags: unknown;
      inventory: unknown;
    };
    expect(migrated?.schemaVersion).toBe(3);
    expect(migratedPayload.worldFlags).toBeDefined();
    expect(migratedPayload.inventory).toEqual({ items: [] });
  });

  it('import/export: full round trip preserves runtime state and leaves import source intact', async () => {
    const a = make();
    const saved = await a.service.saveToSlot('manual-1', runtimeDomain(), ctx());
    if (saved.status !== 'ok') throw new Error('x');
    const exp = await a.service.exportSave('manual-1');
    expect(exp.status).toBe('ok');
    if (exp.status !== 'ok') throw new Error('x');
    expect(exp.text.startsWith('{')).toBe(true);

    const b = make();
    const imp = await b.service.importSave(exp.text, 'manual-2');
    expect(imp.status).toBe('ok');
    if (imp.status !== 'ok') throw new Error('x');
    const loaded = await b.service.loadSlot('manual-2');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('x');
    expect(loaded.runtime.dialogue.active?.mode).toBe('awaitingSkillCheck');
    expect(loaded.runtime.quest.quests['q_watched']?.status).toBe('resolved_success');

    // import must not disturb manual-1 in the source service.
    const src = await a.service.loadSlot('manual-1');
    expect(src.status).toBe('ok');
    if (src.status !== 'ok') throw new Error('x');
    expect(src.runtime.quest.quests['q_ramp']?.status).toBe('active');
  });

  it('malformed import: rejects typed as import-malformed and leaves storage untouched', async () => {
    const { port, service } = make();
    const beforeSlots = await port.listSlots();
    const beforeRecords = await port.listRecordIds();
    const candidates = [
      '{not json',
      '['.repeat(70) + '0' + ']'.repeat(70), // JSON nesting depth 70 > 64
    ];
    for (const text of candidates) {
      const res = await service.importSave(text, 'manual-3');
      expect(res.status).toBe('error');
      if (res.status !== 'error') throw new Error('x');
      expect(res.error.code).toBe('import-malformed');
      expect(await port.listSlots()).toEqual(beforeSlots);
      expect(await port.listRecordIds()).toEqual(beforeRecords);
    }
  });

  it('import remaps nothing else: a checksum mistake surfaces as corrupt-checksum', async () => {
    const { port, service } = make();
    const r = await service.saveToSlot('manual-1', runtimeDomain(), ctx());
    if (r.status !== 'ok') throw new Error('x');
    const exported = await service.exportSave('manual-1');
    if (exported.status !== 'ok') throw new Error('x');
    const parsed = JSON.parse(exported.text) as Record<string, unknown>;
    const payload = parsed['payload'] as unknown as Record<string, unknown>;
    payload['activeChapterId'] = 'ch_other';
    const corrupted = JSON.stringify(parsed);
    const res = await service.importSave(corrupted, 'manual-2');
    expect(res.status).toBe('error');
    if (res.status !== 'error') throw new Error('x');
    expect(res.error.code).toBe('corrupt-checksum');
    expect(await port.getSlot('manual-2')).toBeNull();
  });

  it('AC-04: import pointer-write failure leaves destination pointer + prior record unchanged and a GC-eligible orphan when best-effort delete fails', async () => {
    const { port, service } = make();
    const saved = await service.saveToSlot('manual-1', runtimeDomain(), ctx());
    if (saved.status !== 'ok') throw new Error('x');
    const exported = await service.exportSave('manual-1');
    if (exported.status !== 'ok') throw new Error('x');
    const priorRecord = await port.getRecord(saved.slot.recordId);
    const recordsBefore = (await port.listRecordIds()).length;

    port.faults.failNextPutSlot = true;
    port.faults.failNextDeleteRecord = true; // rollback delete fails too -> orphan stays
    const imp = await service.importSave(exported.text, 'manual-1');
    expect(imp.status).toBe('error');
    if (imp.status !== 'error') throw new Error('x');
    expect(imp.error.code).toBe('persistence-error');

    // Destination slot pointer and the previously referenced record unchanged.
    expect((await port.getSlot('manual-1'))?.recordId).toBe(saved.slot.recordId);
    expect(await port.getRecord(saved.slot.recordId)).toEqual(priorRecord);

    // Post-create failure: a new record WAS written (not byte-for-byte untouched),
    // but it is unreferenced/orphan-only and distinct from the pointer.
    expect((await port.listRecordIds()).length).toBe(recordsBefore + 1);
    const orphan = port.orphanRecordIds();
    expect(orphan).toHaveLength(1);
    expect(orphan[0]).not.toBe(saved.slot.recordId);
    expect(await port.getRecord(orphan[0] as string)).not.toBeNull();
  });

  it('AC-04: import pointer-write failure with successful best-effort rollback leaves no orphan and an unchanged destination', async () => {
    const { port, service } = make();
    const saved = await service.saveToSlot('manual-1', runtimeDomain(), ctx());
    if (saved.status !== 'ok') throw new Error('x');
    const exported = await service.exportSave('manual-1');
    if (exported.status !== 'ok') throw new Error('x');
    const priorRecord = await port.getRecord(saved.slot.recordId);
    const recordsBefore = (await port.listRecordIds()).length;

    port.faults.failNextPutSlot = true; // orphan delete succeeds
    const imp = await service.importSave(exported.text, 'manual-1');
    expect(imp.status).toBe('error');
    if (imp.status !== 'error') throw new Error('x');
    expect(imp.error.code).toBe('persistence-error');

    expect((await port.getSlot('manual-1'))?.recordId).toBe(saved.slot.recordId);
    expect(await port.getRecord(saved.slot.recordId)).toEqual(priorRecord);
    expect(await port.listRecordIds()).toHaveLength(recordsBefore);
    expect(port.orphanRecordIds()).toEqual([]);
  });
});
