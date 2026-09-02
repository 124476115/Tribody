/**
 * FS-SAVE-001 — self-consistent size contract. One configurable cap is shared
 * by save construction, export, and import; every buildable/exportable save is
 * importable under the same cap. Oversize is a typed error, never bare throw.
 */
import { describe, it, expect } from 'vitest';
import { MAX_SERIALIZED_SAVE_BYTES } from '../../../src/domain/save';
import { sha256Hex } from '../../../src/adapters/persistence';
import { SaveService } from '../../../src/application/save';
import { MemoryPersistence } from '../../helpers/memory-persistence';
import { combinedRuntime, fixtureCatalog, domainOf } from '../../helpers/save-fixtures';

describe('WO-013 size contract', () => {
  it('a single shared cap constant exists', () => {
    expect(typeof MAX_SERIALIZED_SAVE_BYTES).toBe('number');
    expect(MAX_SERIALIZED_SAVE_BYTES).toBeGreaterThan(1024 * 1024);
  });

  it('the same cap governs export and import: exportable sizes stay importable', async () => {
    const rt = combinedRuntime();
    const service = new SaveService({
      persistence: new MemoryPersistence(),
      checksummer: { checksum: (t) => sha256Hex(t) },
      clock: { now: () => 1000 },
      catalog: fixtureCatalog(),
    });
    const domain = domainOf(rt);
    const ctx = {
      contentVersion: '0.1.0',
      activeChapterId: 'ch_common_04_countdown',
      activeSceneId: 'sc_ch04_lab_morning',
      playtimeMinutes: 42,
      checkpoint: null,
    };
    const saved = await service.saveToSlot('manual-1', domain, ctx);
    expect(saved.status).toBe('ok');
    if (saved.status !== 'ok') throw new Error('x');
    const exported = await service.exportSave('manual-1');
    expect(exported.status).toBe('ok');
    if (exported.status !== 'ok') throw new Error('x');
    expect(exported.text.length).toBeLessThanOrEqual(MAX_SERIALIZED_SAVE_BYTES);

    const imported = await service.importSave(exported.text, 'manual-2');
    expect(imported.status).toBe('ok');
    if (imported.status !== 'ok') throw new Error('x');
    expect((await service.listSlots()).length).toBe(2);
  });

  it('oversized save/export fails typed as save-oversize; oversized import as import-oversize', async () => {
    const port = new MemoryPersistence();
    const service = new SaveService({
      persistence: port,
      checksummer: { checksum: (t) => sha256Hex(t) },
      clock: { now: () => 1000 },
      catalog: fixtureCatalog(),
      maxSerializedBytes: 256, // tiny cap: any real save exceeds it
    });
    const rt = combinedRuntime();
    const domain = domainOf(rt);
    const ctx = {
      contentVersion: '0.1.0',
      activeChapterId: 'ch_common_04_countdown',
      activeSceneId: 'sc_ch04_lab_morning',
      playtimeMinutes: 42,
      checkpoint: null,
    };
    const saved = await service.saveToSlot('manual-1', domain, ctx);
    expect(saved.status).toBe('error');
    if (saved.status !== 'error') throw new Error('x');
    expect(saved.error.code).toBe('save-oversize');
    expect(await port.listSlots()).toEqual([]);

    const imported = await service.importSave('{"x":'.repeat(400), 'manual-1');
    expect(imported.status).toBe('error');
    if (imported.status !== 'error') throw new Error('x');
    expect(imported.error.code).toBe('import-oversize');
    expect(await port.listSlots()).toEqual([]);
  });

  it('an oversized-but-well-formed import leaves the destination slot untouched', async () => {
    const port = new MemoryPersistence();
    const service = new SaveService({
      persistence: port,
      checksummer: { checksum: (t) => sha256Hex(t) },
      clock: { now: () => 1000 },
      catalog: fixtureCatalog(),
      maxSerializedBytes: 256,
    });
    const rt = combinedRuntime();
    const domain = domainOf(rt);
    const ctx = {
      contentVersion: '0.1.0',
      activeChapterId: 'ch_common_04_countdown',
      activeSceneId: 'sc_ch04_lab_morning',
      playtimeMinutes: 42,
      checkpoint: null,
    };
    const save = await service.saveToSlot('manual-1', domain, ctx);
    expect(save.status).toBe('error'); // over tiny cap
    // Now craft a record over the cap using the default-cap service, export it,
    // and import into the tiny-cap service -> import-oversize, slot untouched.
    const bigService = new SaveService({
      persistence: new MemoryPersistence(),
      checksummer: { checksum: (t) => sha256Hex(t) },
      clock: { now: () => 1000 },
      catalog: fixtureCatalog(),
    });
    const bigSave = await bigService.saveToSlot('manual-1', domain, ctx);
    if (bigSave.status !== 'ok') throw new Error('x');
    const exported = await bigService.exportSave('manual-1');
    if (exported.status !== 'ok') throw new Error('x');

    // pre-fill the destination with a valid save using the tiny-cap service's
    // sibling with the default cap, then attempt the oversized import there.
    const normalService = new SaveService({
      persistence: port,
      checksummer: { checksum: (t) => sha256Hex(t) },
      clock: { now: () => 1000 },
      catalog: fixtureCatalog(),
    });
    const norm = await normalService.saveToSlot('manual-1', domain, ctx);
    expect(norm.status).toBe('ok');
    const before = await port.listSlots();
    expect(before.length).toBe(1);

    const res = await service.importSave(exported.text, 'manual-1');
    expect(res.status).toBe('error');
    if (res.status !== 'error') throw new Error('x');
    expect(res.error.code).toBe('import-oversize');
    expect(await port.listSlots()).toEqual(before);
    expect(port.records.size).toBe(1); // no orphan record from the failed import
  });
});
