/**
 * WO-013 integration — full save/load pipeline over the port with real
 * checksums, real domain runtimes, and hard faults. Covers AC-01 and AC-03.
 *
 * Node environment: IndexedDB itself is exercised by the browser E2E reload
 * spec; here the port is MemoryPersistence with create-only semantics.
 */
import { describe, it, expect } from 'vitest';
import { SaveService } from '../../src/application/save';
import { sha256Hex } from '../../src/adapters/persistence';
import { MemoryPersistence } from '../helpers/memory-persistence';
import {
  combinedRuntime,
  fixtureCatalog,
  questManifests,
  watchedQuestManifest,
  domainOf,
} from '../helpers/save-fixtures';

function ctx(overrides: { playtimeMinutes?: number } = {}) {
  return {
    contentVersion: '0.1.0',
    activeChapterId: 'ch_common_04_countdown',
    activeSceneId: 'sc_ch04_lab_morning',
    playtimeMinutes: overrides.playtimeMinutes ?? 42,
    checkpoint: null,
  };
}

describe('WO-013 integration: save/load pipeline', () => {
  it('full lifecycle: autosave -> reload -> rotate -> quick -> import', async () => {
    const port = new MemoryPersistence();
    let t = 1_000_000;
    const service = new SaveService({
      persistence: port,
      checksummer: { checksum: (text) => sha256Hex(text) },
      clock: { now: () => t },
      catalog: fixtureCatalog(),
    });

    const rt0 = combinedRuntime();
    let last = rt0;
    for (let i = 0; i < 7; i += 1) {
      t += 1;
      const rt = i === 0 ? rt0 : combinedRuntime();
      last = rt;
      const res = await service.autosave(domainOf(rt), ctx());
      expect(res.status).toBe('ok');
    }
    expect((await port.listSlots()).filter((s) => s.kind === 'autosave')).toHaveLength(5);

    const loaded = await service.loadSlot('auto-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('x');
    expect(loaded.runtime.dialogue.active?.mode).toBe('awaitingSkillCheck');
    expect(loaded.runtime.dialogue.active?.pendingCheck?.choiceId).toBe('c_skill');

    const quick = await service.quickSave(domainOf(last), ctx());
    expect(quick.status).toBe('ok');
    if (quick.status !== 'ok') throw new Error('x');
    expect((await port.getSlot('quick'))?.kind).toBe('quick');

    const manual = await service.saveToSlot('manual-1', domainOf(last), ctx());
    expect(manual.status).toBe('ok');
    if (manual.status !== 'ok') throw new Error('x');
    const exported = await service.exportSave('manual-1');
    expect(exported.status).toBe('ok');
    if (exported.status !== 'ok') throw new Error('x');
    const imported = await service.importSave(exported.text, 'manual-2');
    expect(imported.status).toBe('ok');

    const m2 = await service.loadSlot('manual-2');
    expect(m2.status).toBe('ok');
    if (m2.status !== 'ok') throw new Error('x');
    expect(m2.runtime.quest.quests['q_ramp']?.processedEventIds).toEqual(['evt-shared']);
    expect(m2.runtime.quest.quests[watchedQuestManifest().id]?.processedEventIds).toEqual([
      'evt-shared',
    ]);
  });

  it('rotation keeps exactly the chronologically newest 5 autosaves', async () => {
    const port = new MemoryPersistence();
    let t = 0;
    const service = new SaveService({
      persistence: port,
      checksummer: { checksum: (text) => sha256Hex(text) },
      clock: { now: () => t },
      catalog: fixtureCatalog(),
    });
    const stamps: Record<string, number> = {};
    for (let i = 0; i < 12; i += 1) {
      t += 1;
      const rt = combinedRuntime();
      const res = await service.autosave(domainOf(rt), ctx());
      expect(res.status).toBe('ok');
      if (res.status !== 'ok') throw new Error('x');
      stamps[res.slot.slotId] = t;
    }
    const slots = await port.listSlots();
    expect(slots).toHaveLength(5);
    const ages = slots
      .map((s) => stamps[s.slotId])
      .filter((age): age is number => age !== undefined)
      .sort((a, b) => a - b);
    expect(ages).toEqual([8, 9, 10, 11, 12]);
  });

  it('interrupted persist never corrupts the previous accessible save', async () => {
    const port = new MemoryPersistence();
    const service = new SaveService({
      persistence: port,
      checksummer: { checksum: (text) => sha256Hex(text) },
      clock: { now: () => 5000 },
      catalog: fixtureCatalog(),
    });
    const rt = combinedRuntime();
    const first = await service.saveToSlot('manual-1', domainOf(rt), ctx());
    expect(first.status).toBe('ok');
    port.faults.failNextPutSlot = true;
    const second = await service.saveToSlot('manual-1', domainOf(rt), ctx({ playtimeMinutes: 99 }));
    expect(second.status).toBe('error');
    const after = await service.loadSlot('manual-1');
    expect(after.status).toBe('ok');
    expect(port.orphanRecordIds()).toEqual([]);
  });

  it('cross-quest ledger dedup survives the full round trip', async () => {
    const port = new MemoryPersistence();
    const service = new SaveService({
      persistence: port,
      checksummer: { checksum: (text) => sha256Hex(text) },
      clock: { now: () => 6000 },
      catalog: fixtureCatalog(),
    });
    const rt = combinedRuntime();
    const saved = await service.saveToSlot('manual-1', domainOf(rt), ctx());
    expect(saved.status).toBe('ok');
    const loaded = await service.loadSlot('manual-1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('x');
    const q = loaded.runtime.quest.quests;
    expect(Object.keys(q).sort()).toEqual(
      Object.keys(questManifests()).concat(watchedQuestManifest().id).sort()
    );
    for (const id of Object.keys(q)) {
      const state = q[id];
      if (state === undefined) throw new Error('x');
      expect(state.processedEventIds).toEqual(['evt-shared']);
    }
  });
});
