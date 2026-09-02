/**
 * Dev harness manifests (WO-013 E2E only).
 *
 * Syntactic mirrors of the unit-test fixtures so the browser reload spec
 * exercises the SAME deterministic runtime states against real IndexedDB.
 * Abstract keys only; no production prose. Imported solely from src/dev.
 */
import type {
  DialogueChoiceManifest,
  DialogueManifest,
  DialogueNodeManifest,
  Condition,
  Effect,
  QuestManifest,
  QuestObjectiveManifest,
  QuestObjectiveKind,
  QuestResolution,
  QuestInitialState,
} from '../domain/content';
import type { ContentCatalog } from '../application/save';

export type EffectRequest = Effect;

export function devChoice(
  id: string,
  next: string,
  opts: {
    conditions?: Condition[];
    effects?: Effect[];
    skillCheck?: { skillId: string; threshold: number };
  } = {}
): DialogueChoiceManifest {
  return {
    id,
    textKey: `dlg.test.${id}`,
    conditions: opts.conditions ?? [],
    effects: opts.effects ?? [],
    ...(opts.skillCheck !== undefined ? { skillCheck: opts.skillCheck } : {}),
    next,
  };
}

export function devNode(
  speaker: string,
  options: {
    textKey?: string;
    onEnterEffects?: Effect[];
    choices?: DialogueChoiceManifest[];
    autoNext?: string;
  } = {}
): DialogueNodeManifest {
  return {
    speaker,
    ...(options.textKey !== undefined
      ? { textKey: options.textKey }
      : { textKey: `node.line.${speaker}` }),
    tags: [],
    onEnterEffects: options.onEnterEffects ?? [],
    choices: options.choices ?? [],
    ...(options.autoNext !== undefined ? { autoNext: options.autoNext } : {}),
  };
}

/** Structurally equivalent to tests/helpers/dialogue-fixtures.sampleDialogue(). */
export function devDialogueManifest(): DialogueManifest {
  const questEvent = (event: string): Effect => ({ kind: 'quest_event', event });
  const adjustRelationship = (npcId: string, dimension: string, amount: number): Effect => ({
    kind: 'adjust_relationship',
    npcId,
    dimension,
    amount,
  });
  const addCodex = (codexId: string): Effect => ({ kind: 'add_codex', codexId });

  return {
    id: 'dlg_sample_conversation',
    entryNode: 'n01',
    nodes: {
      n01: devNode('npc_lab_colleague', {
        choices: [
          devChoice('c_a', 'n02', {
            conditions: [{ kind: 'flag', flag: 'flag.ch04.data.a' }],
            effects: [questEvent('ch04.raw_data_compare_requested')],
          }),
          devChoice('c_b', 'n03', {
            effects: [adjustRelationship('npc_lab_colleague', 'trust', -2)],
          }),
        ],
      }),
      n02: devNode('npc_lab_colleague', {
        choices: [devChoice('c_back', 'n01'), devChoice('c_done', 'end')],
      }),
      n03: devNode('npc_lab_colleague', {
        choices: [
          devChoice('c_skill', 'n04', {
            skillCheck: { skillId: 'skill_scientist_experimental_design', threshold: 1 },
          }),
          devChoice('c_leave', 'end', {
            effects: [adjustRelationship('npc_lab_colleague', 'familiarity', 2)],
          }),
        ],
      }),
      n04: devNode('npc_lab_colleague', {
        onEnterEffects: [addCodex('codex_science_falsifiability')],
        choices: [devChoice('c_end', 'end')],
      }),
    },
  };
}

export function devObjective(
  id: string,
  type: QuestObjectiveKind,
  opts: {
    required?: boolean;
    npcId?: string;
    sceneId?: string;
    dialogueId?: string;
    itemIds?: string[];
    skillIds?: string[];
    codexIds?: string[];
    evidenceIds?: string[];
    listensFor?: string[];
  } = {}
): QuestObjectiveManifest {
  return {
    id,
    type,
    required: opts.required ?? true,
    ...(opts.npcId !== undefined ? { npcId: opts.npcId } : {}),
    ...(opts.sceneId !== undefined ? { sceneId: opts.sceneId } : {}),
    ...(opts.dialogueId !== undefined ? { dialogueId: opts.dialogueId } : {}),
    ...(opts.itemIds !== undefined ? { itemIds: opts.itemIds } : {}),
    ...(opts.skillIds !== undefined ? { skillIds: opts.skillIds } : {}),
    ...(opts.codexIds !== undefined ? { codexIds: opts.codexIds } : {}),
    ...(opts.evidenceIds !== undefined ? { evidenceIds: opts.evidenceIds } : {}),
    ...(opts.listensFor !== undefined ? { listensFor: opts.listensFor } : {}),
  };
}

export function devQuest(
  id: string,
  opts: {
    chapterId?: string;
    initialState?: QuestInitialState;
    objectives?: QuestObjectiveManifest[];
    onAllRequiredComplete?: QuestResolution['onAllRequiredComplete'];
  } = {}
): QuestManifest {
  const base = id.replace(/^q_/, '');
  return {
    id,
    chapterId: opts.chapterId ?? 'ch_common_04_countdown',
    titleKey: `quest.test.${base}.title`,
    initialState: opts.initialState ?? 'available',
    objectives: opts.objectives ?? [],
    resolution: { onAllRequiredComplete: opts.onAllRequiredComplete ?? 'resolved_success' },
    journal: { startKey: `quest.test.${base}.start`, completeKey: `quest.test.${base}.complete` },
  };
}

export function devQuestManifests(): Record<string, QuestManifest> {
  const ramp = devQuest('q_ramp', {
    objectives: [
      devObjective('obj_a', 'collect_evidence', { evidenceIds: ['ev_a', 'ev_b'] }),
      devObjective('obj_c', 'wait_for_event', { listensFor: ['ch04.compare'] }),
    ],
  });
  const watched = devQuest('q_watched', {
    objectives: [devObjective('obj_signal', 'wait_for_event', { listensFor: ['ch04.compare'] })],
  });
  return { [ramp.id]: ramp, [watched.id]: watched };
}

/** Catalog for the dev harness, consistent with the manifests above. */
export function devContentCatalog(): ContentCatalog {
  const manifest = devDialogueManifest();
  const questMap = devQuestManifests();
  const nodes: ContentCatalog['nodes'] = {};
  const nodeMap: Record<string, { choices: { id: string; skillCheck?: unknown }[] }> = {};
  for (const [nodeId, node] of Object.entries(manifest.nodes)) {
    nodeMap[nodeId] = {
      choices: node.choices.map((c) => ({
        id: c.id,
        ...(c.skillCheck !== undefined ? { skillCheck: c.skillCheck } : {}),
      })),
    };
  }
  nodes[manifest.id] = nodeMap;
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
