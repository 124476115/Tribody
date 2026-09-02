/**
 * Quest runtime test fixtures (WO-012).
 *
 * Mirrors the shape of `content_examples/quest_ch04_sample.yaml` (triage quest:
 * gather camera evidence, request a raw-data comparison, talk to the colleague)
 * with abstract keys and ids only — no production prose.
 */
import type { DomainEvent, JSONValue } from '../../src/domain/events';
import { asEventId, asSequence } from '../../src/domain/events';
import type {
  QuestInitialState,
  QuestManifest,
  QuestObjectiveKind,
  QuestObjectiveManifest,
  QuestResolution,
} from '../../src/domain/content';

export type QuestResolutionTarget = QuestResolution['onAllRequiredComplete'];

export function objective(
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

export function quest(
  id: string,
  opts: {
    chapterId?: string;
    initialState?: QuestInitialState;
    objectives?: QuestObjectiveManifest[];
    onAllRequiredComplete?: QuestResolutionTarget;
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
    journal: {
      startKey: `quest.test.${base}.start`,
      completeKey: `quest.test.${base}.complete`,
    },
  };
}

const CMP_OBJECTIVES: QuestObjectiveManifest[] = [
  objective('obj_camera', 'collect_evidence', {
    evidenceIds: ['ev_camera_original', 'ev_camera_control'],
  }),
  objective('obj_compare', 'analyze', {
    listensFor: ['ch04.raw_data_compare_requested'],
  }),
  objective('obj_talk', 'talk', { npcId: 'npc_lab_colleague' }),
];

/** Structurally equivalent to the WO-010 sample quest (triage line, 3 required steps). */
export function sampleQuest(): QuestManifest {
  return quest('q_ch04_explain_countdown', { objectives: CMP_OBJECTIVES });
}

/** Second, simpler quest that listens to the SAME semantic event (multi-quest tests). */
export function secondQuest(): QuestManifest {
  return quest('q_test_second_witness', {
    objectives: [
      objective('obj_hear', 'wait_for_event', {
        listensFor: ['ch04.raw_data_compare_requested'],
      }),
    ],
  });
}

/** Semantic one-shot quest used for resolution-order tests. */
export function semanticQuest(
  id: string,
  semantic: string,
  opts: { initialState?: QuestInitialState; onAllRequiredComplete?: QuestResolutionTarget } = {}
): QuestManifest {
  return quest(id, {
    ...opts,
    objectives: [objective('obj_solo', 'wait_for_event', { listensFor: [semantic] })],
  });
}

/** Builds a kernel-shaped DomainEvent for synthetic delivery into the quest runtime. */
export function domainEvent(eventId: string, type: string, payload: JSONValue = {}): DomainEvent {
  return { id: asEventId(eventId), type, payload, sequence: asSequence(1) };
}
