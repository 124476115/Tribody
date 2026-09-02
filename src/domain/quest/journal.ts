/**
 * Quest Runtime — journal projection (FS-QUEST-001)
 *
 * Pure read view derived from `QuestState` + `QuestManifest`. Recomputed on
 * demand, never persisted, prose-free (IDs and keys only).
 */
import type { QuestManifest } from '../content';
import type { QuestJournalView, QuestState } from './types';

const TERMINAL_STATUSES = new Set([
  'resolved_success',
  'resolved_costly',
  'resolved_failure',
  'archived',
]);

export function getJournalView(state: QuestState, manifest: QuestManifest): QuestJournalView {
  const latest = state.history[state.history.length - 1];
  return {
    questId: state.questId,
    titleKey: manifest.titleKey,
    status: state.status,
    startKey: manifest.journal.startKey,
    completeKey: manifest.journal.completeKey,
    ...(TERMINAL_STATUSES.has(state.status) ? { resolution: manifest.resolution } : {}),
    objectives: manifest.objectives.map((obj) => ({
      id: obj.id,
      type: obj.type,
      required: obj.required,
      complete: state.objectives[obj.id]?.complete === true,
    })),
    ...(latest === undefined ? {} : { latestTransitionId: latest.transitionId }),
  };
}
