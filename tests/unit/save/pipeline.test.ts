/**
 * FS-SAVE-001 — version-aware load pipeline (stages 1..6 of the shared load
 * path). Asserts: corrupt vs unsupported distinction, finalized-header/checksum
 * corruption, forward-compatible header stage, version-specific strictness
 * after checksum, and old-schema-valid/latest-invalid migration success.
 */
import { describe, it, expect } from 'vitest';
import {
  loadRecord,
  finalizeRecord,
  type LoadedRecord,
  type PipelineGuard,
  type PipelineOptions,
  type MigrationRegistry,
} from '../../../src/application/save';
import { sha256Hex } from '../../../src/adapters/persistence';
import { SaveError, type SavePayload } from '../../../src/domain/save';
import {
  basePayload,
  combinedRuntime,
  dialogueManifest,
  questManifests,
  watchedQuestManifest,
} from '../../helpers/save-fixtures';

/** A v1-shaped payload (dialogue + quest, no exploration) for v1-targeted pipeline tests. */
function payload(): SavePayload {
  const rt = combinedRuntime();
  const v1domain = { dialogue: rt.dialogue, quest: rt.quest };
  return { ...basePayload(), domain: v1domain as unknown as SavePayload['domain'] };
}

function defaultOptions(): PipelineOptions {
  const dlg = dialogueManifest();
  const questMap = { ...questManifests(), [watchedQuestManifest().id]: watchedQuestManifest() };
  const nodes: PipelineOptions['catalog']['nodes'] = {};
  const nodeMap: Record<string, { choices: { id: string; skillCheck?: unknown }[] }> = {};
  for (const [nodeId, node] of Object.entries(dlg.nodes)) {
    nodeMap[nodeId] = {
      choices: node.choices.map((c) => ({
        id: c.id,
        ...(c.skillCheck !== undefined ? { skillCheck: {} } : {}),
      })),
    };
  }
  nodes[dlg.id] = nodeMap;
  return {
    checksummer: { checksum: (text) => sha256Hex(text) },
    catalog: {
      contentVersion: '0.1.0',
      chapters: { ch_common_04_countdown: { entrySceneId: 'sc_ch04_lab_morning' } },
      scenes: { sc_ch04_lab_morning: { chapterId: 'ch_common_04_countdown' } },
      dialogues: { [dlg.id]: { entryNode: dlg.entryNode } },
      nodes,
      quests: Object.fromEntries(
        Object.entries(questMap).map(([id, q]) => [
          id,
          { objectiveIds: q.objectives.map((o) => o.id) },
        ])
      ),
      items: {},
    },
  };
}

async function rawRecord(opts: {
  checksummer?: PipelineOptions['checksummer'];
  schemaVersion?: number;
  contentVersion?: string;
  gameVersion?: string;
  createdAt?: number;
  payload?: ReturnType<typeof payload>;
  extraTopLevel?: Record<string, unknown>;
}): Promise<string> {
  const base = {
    schemaVersion: opts.schemaVersion ?? 1,
    contentVersion: opts.contentVersion ?? '0.1.0',
    gameVersion: opts.gameVersion ?? '0.0.1',
    createdAt: opts.createdAt ?? 1_700_000_000_000,
    payload: opts.payload ?? payload(),
  };
  const finalized = await finalizeRecord(
    opts.checksummer ?? { checksum: (t) => sha256Hex(t) },
    base
  );
  return JSON.stringify({ ...finalized, ...(opts.extraTopLevel ?? {}) });
}

async function load(raw: string, options?: Partial<PipelineOptions>) {
  return loadRecord(raw, { ...defaultOptions(), ...options } as PipelineOptions);
}

function expectCode(promise: Promise<LoadedRecord>, code: string): Promise<SaveError> {
  return promise.then(
    () => {
      throw new Error(`expected ${code}`);
    },
    (error: SaveError) => {
      expect(error.code).toBe(code);
      return error;
    }
  );
}

describe('WO-013 load pipeline', () => {
  it('stage 1: unparseable JSON is corrupt-json', async () => {
    await expectCode(load('{not json'), 'corrupt-json');
  });

  it('stage 2: non-object / malformed header is corrupt-shape', async () => {
    await expectCode(load('"plain"'), 'corrupt-shape');
    await expectCode(load(JSON.stringify({ checksum: 'x', payload: {} })), 'corrupt-shape');
    await expectCode(load(JSON.stringify({ schemaVersion: 1, payload: {} })), 'corrupt-shape');
  });

  it('stage 3: checksum corruption on finalized header/payload fields', async () => {
    const raw = await rawRecord({});
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const flip = (target: string) => {
      const copy = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
      copy[target] = String(copy[target]).replace(/.$/, 'x');
      return JSON.stringify(copy);
    };
    const control = await load(JSON.stringify(parsed));
    expect(control.record.schemaVersion).toBe(1);
    // payload byte flip without checksum update
    const payloadFlip = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
    (payloadFlip['payload'] as Record<string, unknown>)['activeChapterId'] = 'ch_other';
    await expectCode(load(JSON.stringify(payloadFlip)), 'corrupt-checksum');
    // checksum field itself flipped
    await expectCode(load(flip('checksum')), 'corrupt-checksum');
    // checksum-already-wrong control test is above; schemaVersion flip is covered separately
  });

  it('a checksum-verified newer schema is unsupported-schema, never corruption', async () => {
    const raw = await rawRecord({ schemaVersion: 999 });
    const err = await expectCode(load(raw), 'unsupported-schema');
    expect(err.code).toBe('unsupported-schema');
  });

  it('an unverified header version flip is corrupt-checksum, not unsupported-schema', async () => {
    const raw = await rawRecord({ schemaVersion: 1 });
    const tampered = JSON.parse(raw) as Record<string, unknown>;
    tampered['schemaVersion'] = 2; // no checksum recompute
    const err = await expectCode(load(JSON.stringify(tampered)), 'corrupt-checksum');
    expect(err.code).toBe('corrupt-checksum');
  });

  it('stage 2 accepts unknown top-level fields for forward compatibility', async () => {
    const raw = await rawRecord({ extraTopLevel: { futureChannel: { a: [1, 2] } } });
    const out = await load(raw);
    expect(out.applied).toEqual([]);
    expect(out.record.payload.domain).toBeDefined();
  });

  it('old-schema-valid / latest-schema-invalid migrates and only then validates latest', async () => {
    const rec = (p: unknown) => p as Record<string, unknown>;
    const guards: Record<number, PipelineGuard> = {
      1: () => undefined,
      2: (p) => {
        if (rec(p)['worldFlags'] === undefined) throw new SaveError('corrupt-shape', 'v2 guard');
      },
      3: (p) => {
        const r = rec(p);
        if (r['worldFlags'] === undefined || r['inventory'] === undefined) {
          throw new SaveError('corrupt-shape', 'v3 guard');
        }
      },
    };
    const migrations: MigrationRegistry = {
      2: (p) => ({ ...(p as object), worldFlags: {} }),
      3: (p) => ({ ...(p as object), inventory: { items: [] } }),
    };
    const options: PipelineOptions = {
      ...defaultOptions(),
      target: 3,
      guards,
      migrations,
    };
    // The v3 guard REJECTS the un-migrated v1 payload: migration must run first.
    expect(() => guards[3]?.(payload())).toThrowError(SaveError);
    const raw = await rawRecord({});
    const out = await loadRecord(raw, options);
    expect(out.applied).toEqual([2, 3]);
    const migratedPayload = out.record.payload as unknown as {
      worldFlags: unknown;
      inventory: unknown;
    };
    expect(migratedPayload.worldFlags).toBeDefined();
    expect(migratedPayload.inventory).toEqual({ items: [] });

    // The returned record is finalized with a recomputed checksum for the migrated body.
    const expected = await finalizeRecord(
      { checksum: (t) => sha256Hex(t) },
      {
        schemaVersion: 3,
        contentVersion: out.record.contentVersion,
        gameVersion: out.record.gameVersion,
        createdAt: out.record.createdAt,
        payload: out.record.payload,
      }
    );
    expect(out.record.checksum).toBe(expected.checksum);
  });

  it('a missing migration on the path to a supported target is missing-migration', async () => {
    const options: PipelineOptions = {
      ...defaultOptions(),
      target: 3,
      guards: { 1: () => undefined },
      migrations: { 3: (p) => p },
    };
    const raw = await rawRecord({});
    await expectCode(loadRecord(raw, options), 'missing-migration');
  });

  it('strict version-specific payload validation rejects unknown payload keys after checksum', async () => {
    const badPayload = { ...payload(), worldFlags: {} } as unknown as ReturnType<typeof payload>;
    const raw = await rawRecord({ payload: badPayload });
    await expectCode(load(raw), 'corrupt-shape');
  });

  it('hydrates continuation-critical dialogue and quest runtime state', async () => {
    const rt = combinedRuntime();
    const v1domain = { dialogue: rt.dialogue, quest: rt.quest };
    const out = await loadRecord(
      await rawRecord({
        payload: { ...basePayload(), domain: v1domain as unknown as SavePayload['domain'] },
      }),
      defaultOptions()
    );
    expect(out.runtime.dialogue.active?.mode).toBe('awaitingSkillCheck');
    expect(out.runtime.dialogue.active?.pendingCheck?.choiceId).toBe('c_skill');
    expect(out.runtime.dialogue.processedRequestIds).toContain('ReqSelSkill');
    expect(out.runtime.quest.quests['q_ramp']?.processedEventIds).toEqual(['evt-shared']);
    expect(out.runtime.quest.quests[watchedQuestManifest().id]?.processedEventIds).toEqual([
      'evt-shared',
    ]);
  });
});
