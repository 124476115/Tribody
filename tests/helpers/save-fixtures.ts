/**
 * Save system test fixtures (WO-013).
 *
 * Builds realistic Dialogue + Quest runtime states and rule-valid content
 * catalogs/migrations. All text is abstract keys; no production prose.
 */
import type { DialogueSavedState } from '../../src/domain/dialogue';
import { createDialogueDomain, dialogueSelect, dialogueStart } from '../../src/domain/dialogue';
import type { QuestSavedState } from '../../src/domain/quest';
import { createQuestDomain, questApplyEvent, questInit, questStart } from '../../src/domain/quest';
import type { ExplorationSavedState } from '../../src/domain/exploration';
import { createExplorationState } from '../../src/domain/exploration';
import type { ProgressionSavedState } from '../../src/domain/progression';
import { createProgressionState } from '../../src/domain/progression';
import type { SkillsSavedState } from '../../src/domain/skills';
import { createSkillsState } from '../../src/domain/skills';
import type { InventorySavedState } from '../../src/domain/inventory';
import { createInventoryState } from '../../src/domain/inventory';
import type { QuestManifest } from '../../src/domain/content';
import type { DomainEvent } from '../../src/domain/events';
import { sampleDialogue, snapshot } from './dialogue-fixtures';
import { domainEvent, objective, quest } from './quest-fixtures';
import type { ContentCatalog } from '../../src/application/save';
import type { SavePayload, SaveRecord } from '../../src/domain/save';

export interface RuntimeFixture {
  dialogue: DialogueSavedState;
  quest: QuestSavedState;
  exploration: ExplorationSavedState;
  progression: ProgressionSavedState;
  skills: SkillsSavedState;
  inventory: InventorySavedState;
  activeChapterId: string;
  activeSceneId: string;
  playtimeMinutes: number;
}

/** Real dialogue manifest mirroring `content_examples/dialogue_ch04_sample.yaml`. */
export function dialogueManifest() {
  return sampleDialogue();
}

/** Real quest manifests. */
export function questManifests(): Record<string, QuestManifest> {
  const ramp = quest('q_ramp', {
    objectives: [
      objective('obj_a', 'collect_evidence', { evidenceIds: ['ev_a', 'ev_b'] }),
      objective('obj_c', 'wait_for_event', { listensFor: ['ch04.compare'] }),
    ],
  });
  return { [ramp.id]: ramp };
}

/** The companion quest shared by the fixture quests for multi-quest dedup. */
export function watchedQuestManifest(): QuestManifest {
  return quest('q_watched', {
    objectives: [objective('obj_signal', 'wait_for_event', { listensFor: ['ch04.compare'] })],
  });
}

/**
 * A mid-conversation runtime with a pending skill check, plus two quests where
 * one shared occurrence already advanced both (dedup ledgers populated).
 */
export function combinedRuntime(): RuntimeFixture {
  const manifest = sampleDialogue();
  let dialogue = createDialogueDomain();
  const start = dialogueStart(dialogue, manifest, {
    requestId: 'ReqStart',
    dialogueId: manifest.id,
  });
  if (start.status !== 'committed') throw new Error('fixture start');
  dialogue = start.state;
  const selectB = dialogueSelect(
    dialogue,
    manifest,
    { requestId: 'ReqSelB', choiceId: 'c_b' },
    snapshot()
  );
  if (selectB.status !== 'committed') throw new Error('fixture select c_b');
  dialogue = selectB.state;
  const selectSkill = dialogueSelect(
    dialogue,
    manifest,
    { requestId: 'ReqSelSkill', choiceId: 'c_skill' },
    snapshot()
  );
  if (selectSkill.status !== 'committed') throw new Error('fixture select c_skill');
  dialogue = selectSkill.state;
  if (dialogue.active?.mode !== 'awaitingSkillCheck') throw new Error('fixture should park');

  const watches = watchedQuestManifest();
  const allQuests = { ...questManifests(), [watches.id]: watches };
  let quest = createQuestDomain();
  const init = questInit(quest, allQuests);
  if (init.status !== 'committed') throw new Error('fixture init');
  quest = init.state;
  const startedIds: string[] = [];
  for (const id of Object.keys(allQuests)) {
    const started = questStart(quest, allQuests, { questId: id });
    if (started.status !== 'committed') throw new Error('fixture start quest');
    if (started.transitions.length > 0) startedIds.push(id);
    quest = started.state;
  }
  const applied = questApplyEvent(quest, allQuests, domainEvent('evt-shared', 'ch04.compare'));
  if (applied.status !== 'committed') throw new Error('fixture apply event');
  quest = applied.state;
  if (quest.quests['q_ramp']?.processedEventIds.length !== 1) throw new Error('fixture dedup');
  if (quest.quests[watches.id]?.processedEventIds.length !== 1)
    throw new Error('fixture watcher dedup');

  const exploration = createExplorationState();
  exploration.sceneId = 'sc_ch04_lab_morning';
  exploration.position = { x: 2, y: 2 };
  exploration.visitedScenes = ['sc_ch04_lab_morning'];

  return {
    dialogue,
    quest,
    exploration,
    progression: createProgressionState(),
    skills: createSkillsState(),
    inventory: createInventoryState(),
    activeChapterId: 'ch_common_04_countdown',
    activeSceneId: 'sc_ch04_lab_morning',
    playtimeMinutes: 42,
  };
}

/** Builds the current-manifest catalog consistent with the fixture runtimes. */
export function fixtureCatalog(): ContentCatalog {
  const manifest = sampleDialogue();
  const questMap = { ...questManifests(), [watchedQuestManifest().id]: watchedQuestManifest() };
  const nodes: ContentCatalog['nodes'] = {};
  for (const [dialogueId, dm] of Object.entries({ [manifest.id]: manifest })) {
    const nodeMap: Record<string, { choices: { id: string; skillCheck?: unknown }[] }> = {};
    for (const [nodeId, node] of Object.entries(dm.nodes)) {
      nodeMap[nodeId] = {
        choices: node.choices.map((c) => ({
          id: c.id,
          ...(c.skillCheck !== undefined ? { skillCheck: c.skillCheck } : {}),
        })),
      };
    }
    nodes[dialogueId] = nodeMap;
  }
  return {
    contentVersion: '0.1.0',
    chapters: { ch_common_04_countdown: { entrySceneId: 'sc_ch04_lab_morning' } },
    scenes: { sc_ch04_lab_morning: { chapterId: 'ch_common_04_countdown' } },
    dialogues: { [manifest.id]: { entryNode: manifest.entryNode } },
    nodes,
    quests: Object.fromEntries(
      Object.entries(questMap).map(([id, q]) => [
        id,
        { objectiveIds: q.objectives.map((o) => o.id) },
      ])
    ),
    items: {
      item_tool_relay_scanner: { slot: 'tool', stackable: false, questProtected: false },
      item_consumable_notch: { stackable: true, questProtected: false },
    },
  };
}

/** The full SaveDomain object from a combined runtime fixture. */
export function domainOf(rt: RuntimeFixture): {
  dialogue: DialogueSavedState;
  quest: QuestSavedState;
  exploration: ExplorationSavedState;
  progression: ProgressionSavedState;
  skills: SkillsSavedState;
  inventory: InventorySavedState;
} {
  return {
    dialogue: rt.dialogue,
    quest: rt.quest,
    exploration: rt.exploration,
    progression: rt.progression,
    skills: rt.skills,
    inventory: rt.inventory,
  };
}

export function basePayload(): SavePayload {
  const exploration = createExplorationState();
  exploration.sceneId = 'sc_ch04_lab_morning';
  exploration.position = { x: 0, y: 0 };
  exploration.visitedScenes = ['sc_ch04_lab_morning'];
  return {
    activeChapterId: 'ch_common_04_countdown',
    activeSceneId: 'sc_ch04_lab_morning',
    checkpoint: {
      chapterId: 'ch_common_04_countdown',
      sceneId: 'sc_ch04_lab_morning',
      scope: 'manual',
    },
    playtimeMinutes: 42,
    domain: {
      dialogue: createDialogueDomain(),
      quest: createQuestDomain(),
      exploration,
      progression: createProgressionState(),
      skills: createSkillsState(),
      inventory: createInventoryState(),
    },
  };
}

export function recordFor(payload: SavePayload): SaveRecord {
  return {
    schemaVersion: 1,
    contentVersion: '0.1.0',
    gameVersion: '0.0.1',
    createdAt: 1_700_000_000_000,
    checksum: 'PLACEHOLDER',
    payload,
  };
}

/** Semi-random event id helper for noticing accidental ledger growth in fixtures. */
export function domainEvent2(
  eventId: string,
  type: string,
  payload: Record<string, string> = {}
): DomainEvent {
  return domainEvent(eventId, type, payload);
}
