/**
 * Dev-only save harness (WO-013 E2E).
 *
 * Installs window.__trisolaris in DEV builds. Drives the REAL dialogue/quest
 * domains to a deterministic mid-conversation + advanced-quests state, saves
 * via the REAL SaveService + IndexedDB adapter, and exposes load + raw-record
 * oracles so the reload spec can assert on the REAL load/hydrate path.
 *
 * Never imported by production paths outside bootstrap's DEV guard.
 */
import {
  createDialogueDomain,
  dialogueSelect,
  dialogueStart,
  type DialogueSavedState,
  type DialogueSessionMode,
  type DialogueSnapshot,
} from '../domain/dialogue';
import {
  createQuestDomain,
  questApplyEvent,
  questInit,
  questStart,
  type QuestSavedState,
} from '../domain/quest';
import { asEventId, asSequence, type JSONValue } from '../domain/events';
import { SaveService } from '../application/save';
import { IndexedDBPersistence, sha256Hex } from '../adapters/persistence';
import { devContentCatalog, devDialogueManifest, devQuestManifests } from './manifests';
import type { ExplorationSavedState } from '../domain/exploration';
import { createProgressionState, type ProgressionSavedState } from '../domain/progression';
import { createSkillsState, type SkillsSavedState } from '../domain/skills';
import { createInventoryState, type InventorySavedState } from '../domain/inventory';
import type { SaveSlotDoc, SaveSlotId } from '../domain/save';

export interface HarnessRuntimeSummary {
  dialogue: {
    mode: DialogueSessionMode;
    nodeId: string | null;
    pendingCheck: { nodeId: string; choiceId: string } | null;
    processedRequestIds: string[];
    nextInstanceOrdinal: Record<string, number>;
  };
  quests: Record<
    string,
    {
      status: string;
      processedEventIds: string[];
      nextTransitionOrdinal: number;
      objectives: Record<string, { complete: boolean; matchedKeys: string[] }>;
    }
  >;
}

export type HarnessSaveResult =
  | { status: 'ok'; slot: { recordId: string; slotId: string }; state: HarnessRuntimeSummary }
  | { status: 'error'; code: string };

export type HarnessLoadResult =
  | { status: 'ok'; state: HarnessRuntimeSummary; warnings: string[] }
  | { status: 'error'; code: string };

export interface DevSaveHarness {
  saveHarnessStep(slotId: string): Promise<HarnessSaveResult>;
  loadHarnessStep(slotId: string): Promise<HarnessLoadResult>;
  rawRecord(slotId: string): Promise<{ checksum: string; schemaVersion: number } | null>;
  listSlots(): Promise<Pick<SaveSlotDoc, 'slotId' | 'kind' | 'updatedAt'>[]>;
}

function summaryOf(state: {
  dialogue: DialogueSavedState;
  quest: QuestSavedState;
}): HarnessRuntimeSummary {
  const active = state.dialogue.active;
  return {
    dialogue: {
      mode: active?.mode ?? 'ended',
      nodeId: active?.nodeId ?? null,
      pendingCheck: active?.pendingCheck ?? null,
      processedRequestIds: [...state.dialogue.processedRequestIds],
      nextInstanceOrdinal: { ...state.dialogue.nextInstanceOrdinal },
    },
    quests: Object.fromEntries(
      Object.entries(state.quest.quests).map(([id, q]) => [
        id,
        {
          status: q.status,
          processedEventIds: [...q.processedEventIds],
          nextTransitionOrdinal: q.nextTransitionOrdinal,
          objectives: Object.fromEntries(
            Object.entries(q.objectives).map(([oid, obj]) => [
              oid,
              { complete: obj.complete, matchedKeys: [...obj.matchedKeys] },
            ])
          ),
        },
      ])
    ),
  };
}

function runSnapshot(): DialogueSnapshot {
  return {
    activeChapterId: 'ch_common_04_countdown',
    activeSceneId: 'sc_ch04_lab_morning',
    flags: {},
    questStates: {},
    relationships: {},
    skillValues: {},
    itemCounts: {},
    codexUnlocked: {},
  };
}

/** Deterministic "mid-conversation, skill check parked, two quests advanced" state. */
function builtRuntime(): {
  dialogue: DialogueSavedState;
  quest: QuestSavedState;
  exploration: ExplorationSavedState;
  progression: ProgressionSavedState;
  skills: SkillsSavedState;
  inventory: InventorySavedState;
} {
  const dialogueManifest = devDialogueManifest();
  let dialogue = createDialogueDomain();
  const start = dialogueStart(dialogue, dialogueManifest, {
    requestId: 'ReqStart',
    dialogueId: dialogueManifest.id,
  });
  if (start.status !== 'committed') throw new Error('dev: start');
  dialogue = start.state;
  const selB = dialogueSelect(
    dialogue,
    dialogueManifest,
    { requestId: 'ReqSelB', choiceId: 'c_b' },
    runSnapshot()
  );
  if (selB.status !== 'committed') throw new Error('dev: select c_b');
  dialogue = selB.state;
  const selSkill = dialogueSelect(
    dialogue,
    dialogueManifest,
    { requestId: 'ReqSelSkill', choiceId: 'c_skill' },
    runSnapshot()
  );
  if (selSkill.status !== 'committed') throw new Error('dev: select c_skill');
  dialogue = selSkill.state;
  if (dialogue.active?.mode !== 'awaitingSkillCheck') throw new Error('dev: park');

  const manifests = devQuestManifests();
  let quest = createQuestDomain();
  const init = questInit(quest, manifests);
  if (init.status !== 'committed') throw new Error('dev: quest init');
  quest = init.state;
  for (const id of Object.keys(manifests)) {
    const started = questStart(quest, manifests, { questId: id });
    if (started.status !== 'committed') throw new Error('dev: quest start');
    quest = started.state;
  }
  const applied = questApplyEvent(quest, manifests, {
    id: asEventId('evt-shared'),
    type: 'ch04.compare',
    payload: {} as JSONValue,
    sequence: asSequence(1),
  });
  if (applied.status !== 'committed') throw new Error('dev: quest apply');

  const exploration: ExplorationSavedState = {
    sceneId: 'sc_ch04_lab_morning',
    position: { x: 2, y: 2 },
    visitedScenes: ['sc_ch04_lab_morning'],
  };

  return {
    dialogue: dialogue,
    quest: applied.state,
    exploration,
    progression: createProgressionState(),
    skills: createSkillsState(),
    inventory: createInventoryState(),
  };
}

function getServiceFactory(): () => Promise<SaveService> {
  let service: SaveService | null = null;
  return () => {
    if (service === null) {
      const persistence = new IndexedDBPersistence();
      service = new SaveService({
        persistence,
        checksummer: { checksum: (text) => sha256Hex(text) },
        clock: { now: () => Date.now() },
        catalog: devContentCatalog(),
      });
    }
    return Promise.resolve(service);
  };
}

export function installDevSaveHarness(): void {
  const getService = getServiceFactory();

  const harness: DevSaveHarness = {
    async saveHarnessStep(slotId) {
      const s = await getService();
      const runtime = builtRuntime();
      const summary = summaryOf(runtime);
      const result = await s.saveToSlot(slotId as SaveSlotId, runtime, {
        contentVersion: '0.1.0',
        activeChapterId: 'ch_common_04_countdown',
        activeSceneId: 'sc_ch04_lab_morning',
        playtimeMinutes: 42,
        checkpoint: null,
      });
      if (result.status !== 'ok') return { status: 'error', code: result.error.code };
      return {
        status: 'ok',
        slot: { recordId: result.slot.recordId, slotId: result.slot.slotId },
        state: summary,
      };
    },

    async loadHarnessStep(slotId) {
      const s = await getService();
      const result = await s.loadSlot(slotId as SaveSlotId);
      if (result.status !== 'ok') return { status: 'error', code: result.error.code };
      return {
        status: 'ok',
        state: summaryOf(result.runtime),
        warnings: result.warnings.map((w) => w.code),
      };
    },

    async rawRecord(slotId) {
      const s = await getService();
      const slot = await s.persistence.getSlot(slotId as SaveSlotId);
      if (slot === null) return null;
      const record = await s.persistence.getRecord(slot.recordId);
      if (record === null) return null;
      return { checksum: record.checksum, schemaVersion: record.schemaVersion };
    },

    async listSlots() {
      const s = await getService();
      const slots = await s.persistence.listSlots();
      return slots.map((doc) => ({ slotId: doc.slotId, kind: doc.kind, updatedAt: doc.updatedAt }));
    },
  };

  (window as unknown as { __trisolaris?: DevSaveHarness }).__trisolaris = harness;
}
