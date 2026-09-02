/**
 * WO-013 AC-04 — export/import semantics on top of the shared pipeline.
 *
 * Export reflects the immutable record; import re-validates with the
 * destination catalog, commits atomically, and refuses incompatible content
 * without touching storage.
 */
import { describe, it, expect } from 'vitest';
import { SaveService, type SaveServiceOptions } from '../../../src/application/save';
import { sha256Hex } from '../../../src/adapters/persistence';
import { MemoryPersistence } from '../../helpers/memory-persistence';
import { combinedRuntime, fixtureCatalog, domainOf } from '../../helpers/save-fixtures';

function make(opts: Partial<SaveServiceOptions> = {}) {
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

function ctx() {
  return {
    contentVersion: '0.1.0',
    activeChapterId: 'ch_common_04_countdown',
    activeSceneId: 'sc_ch04_lab_morning',
    playtimeMinutes: 42,
    checkpoint: null,
  };
}

describe('WO-013 export/import', () => {
  it('export of a missing slot fails typed as slot-not-found', async () => {
    const { service } = make();
    const res = await service.exportSave('manual-3');
    expect(res.status).toBe('error');
    if (res.status !== 'error') throw new Error('x');
    expect(res.error.code).toBe('slot-not-found');
  });

  it('import re-validates content version against the target catalog', async () => {
    const src = make();
    const saved = await src.service.saveToSlot(
      'manual-1',
      (() => {
        const rt = combinedRuntime();
        return domainOf(rt);
      })(),
      ctx()
    );
    if (saved.status !== 'ok') throw new Error('x');
    const exported = await src.service.exportSave('manual-1');
    if (exported.status !== 'ok') throw new Error('x');

    const dst = make({ catalog: { ...fixtureCatalog(), contentVersion: '9.9.9' } });
    const res = await dst.service.importSave(exported.text, 'manual-2');
    expect(res.status).toBe('error');
    if (res.status !== 'error') throw new Error('x');
    expect(res.error.code).toBe('content-incompatible');
    expect(await dst.port.listSlots()).toEqual([]);
    expect(await dst.port.listRecordIds()).toEqual([]);
  });

  it('import refuses a payload that references content missing from the target catalog', async () => {
    const src = make();
    const saved = await src.service.saveToSlot(
      'manual-1',
      (() => {
        const rt = combinedRuntime();
        return domainOf(rt);
      })(),
      ctx()
    );
    if (saved.status !== 'ok') throw new Error('x');
    const exported = await src.service.exportSave('manual-1');
    if (exported.status !== 'ok') throw new Error('x');

    const dst = make({ catalog: { ...fixtureCatalog(), scenes: {} } });
    const res = await dst.service.importSave(exported.text, 'manual-2');
    expect(res.status).toBe('error');
    if (res.status !== 'error') throw new Error('x');
    expect(res.error.code).toBe('content-incompatible');
    expect(await dst.port.listSlots()).toEqual([]);
    expect(await dst.port.listRecordIds()).toEqual([]);
  });

  it('a good import into an occupied slot overwrites only the pointer; the old record stays intact', async () => {
    const a = make();
    const first = await a.service.saveToSlot(
      'manual-2',
      (() => {
        const rt = combinedRuntime();
        return domainOf(rt);
      })(),
      ctx()
    );
    if (first.status !== 'ok') throw new Error('x');
    const oldId = first.slot.recordId;
    const oldRecord = await a.port.getRecord(oldId);

    const src = make();
    await src.service.saveToSlot(
      'manual-1',
      (() => {
        const rt = combinedRuntime();
        return domainOf(rt);
      })(),
      ctx()
    );
    const exported = await src.service.exportSave('manual-1');
    if (exported.status !== 'ok') throw new Error('x');

    const imp = await a.service.importSave(exported.text, 'manual-2');
    expect(imp.status).toBe('ok');
    if (imp.status !== 'ok') throw new Error('x');
    const doc = await a.port.getSlot('manual-2');
    expect(doc?.recordId).not.toBe(oldId);
    expect((await a.port.getRecord(oldId))?.checksum).toBe(oldRecord?.checksum); // intact
    expect(a.port.records.size).toBe(2); // old + newly imported, original source untouched elsewhere
  });

  it('export round-trips stable bytes: importing then re-exporting keeps the checksum text identical', async () => {
    const a = make();
    await a.service.saveToSlot(
      'manual-1',
      (() => {
        const rt = combinedRuntime();
        return domainOf(rt);
      })(),
      ctx()
    );
    const exp1 = await a.service.exportSave('manual-1');
    if (exp1.status !== 'ok') throw new Error('x');

    const b = make();
    await b.service.importSave(exp1.text, 'manual-1');
    const exp2 = await b.service.exportSave('manual-1');
    if (exp2.status !== 'ok') throw new Error('x');
    expect(exp2.text).toBe(exp1.text);
  });
});
