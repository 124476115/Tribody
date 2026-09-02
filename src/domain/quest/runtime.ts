/**
 * Quest Runtime — deterministic state machine (FS-QUEST-001)
 *
 * Pure, deterministic, fully serializable. Sequential steps (init/start/archive)
 * emit at most one transition each; event steps emit at most one transition per
 * quest and commit all affected quests atomically. Errors are typed results
 * that leave the previous state untouched and consume no transition ordinal.
 *
 * Design points (WO-012 plan-review corrections):
 * 1. Per-quest exact-once: `QuestState.processedEventIds` — an occurrence
 *    progresses a quest at most once; the same occurrence may advance several
 *    quests once each; set-based evidence keys never double-count.
 * 2. Canonical lifecycle vocabulary; `resolved_*` is terminal and only
 *    `questArchive` may move it to `archived`.
 * 3. No placeholder outputs — transitions carry meaningful facts only.
 * 4. No global request ledger; `questInit` is naturally idempotent.
 * 5. A valid but unmatched event is `irrelevant` (never "unknown event type").
 * 6. Only `active` quests advance; events before start are intentionally lost
 *    (snapshot semantics, no replay/Event Sourcing).
 */
import type { DomainEvent } from '../events';
import type { QuestManifest } from '../content';
import { matchObjective, matchedKeyFor, objectiveMatchOrigin } from './matching';
import {
  QuestDomainError,
  type QuestApplyResult,
  type QuestErrorCode,
  type QuestHistoryEntry,
  type QuestInitResult,
  type QuestSavedState,
  type QuestState,
  type QuestStepResult,
  type QuestTransition,
  type QuestTransitionKind,
} from './types';

const RESOLVED_STATUSES = new Set(['resolved_success', 'resolved_costly', 'resolved_failure']);

export function createQuestDomain(): QuestSavedState {
  return { quests: {} };
}

export function questInit(
  domain: QuestSavedState,
  manifests: Record<string, QuestManifest>
): QuestInitResult {
  const entries = Object.entries(manifests).sort(([a], [b]) => a.localeCompare(b));
  for (const [questId, manifest] of entries) {
    if (domain.quests[questId] !== undefined) continue;
    const unreachable = manifest.objectives.some(
      (obj) => obj.required && objectiveMatchOrigin(obj) === 'none'
    );
    if (unreachable) {
      return {
        status: 'error',
        state: domain,
        error: new QuestDomainError(
          'impossible-required-objective',
          `quest "${questId}" has a required objective with no reachable match rule`
        ),
      };
    }
  }
  const quests: Record<string, QuestState> = { ...domain.quests };
  const initializedQuestIds: string[] = [];
  for (const [questId, manifest] of entries) {
    if (quests[questId] !== undefined) continue;
    quests[questId] = seedQuest(manifest);
    initializedQuestIds.push(questId);
  }
  if (initializedQuestIds.length === 0) return { status: 'unchanged', state: domain };
  return { status: 'committed', state: { quests }, initializedQuestIds };
}

export function questStart(
  domain: QuestSavedState,
  manifests: Record<string, QuestManifest>,
  intent: { questId: string }
): QuestStepResult {
  const questId = intent.questId;
  const quest = domain.quests[questId];
  if (quest === undefined) return fail('unknown-quest', `no initialised quest "${questId}"`);
  const manifest = manifests[questId];
  if (manifest === undefined) {
    return fail('malformed-content', `no runtime manifest loaded for quest "${questId}"`);
  }
  switch (quest.status) {
    case 'locked':
      return fail('quest-locked', `quest "${questId}" is locked`);
    case 'active':
      return fail('already-active', `quest "${questId}" is already active`);
    case 'available':
      break;
    default:
      return fail('quest-terminal', `quest "${questId}" is already ${quest.status}`);
  }
  return commitStep(domain, quest, 'quest_started', { nextStatus: 'active' });
}

export function questArchive(
  domain: QuestSavedState,
  manifests: Record<string, QuestManifest>,
  intent: { questId: string }
): QuestStepResult {
  const questId = intent.questId;
  const quest = domain.quests[questId];
  if (quest === undefined) return fail('unknown-quest', `no initialised quest "${questId}"`);
  const manifest = manifests[questId];
  if (manifest === undefined) {
    return fail('malformed-content', `no runtime manifest loaded for quest "${questId}"`);
  }
  if (!RESOLVED_STATUSES.has(quest.status)) {
    return fail('invalid-transition', `quest "${questId}" is not resolved`);
  }
  return commitStep(domain, quest, 'quest_archived', { nextStatus: 'archived' });
}

export function questApplyEvent(
  domain: QuestSavedState,
  manifests: Record<string, QuestManifest>,
  event: DomainEvent
): QuestApplyResult {
  let changedQuests: Record<string, QuestState> | null = null;
  const transitions: QuestTransition[] = [];
  for (const questId of Object.keys(domain.quests)) {
    const quest = domain.quests[questId];
    if (quest === undefined) continue;
    const manifest = manifests[questId];
    if (manifest === undefined) continue; // quest not loaded in this session
    const outcome = applyEventToQuest(quest, manifest, event);
    if (outcome.transition === null) continue;
    changedQuests ??= { ...domain.quests };
    changedQuests[questId] = outcome.next;
    transitions.push(outcome.transition);
  }
  if (changedQuests === null) return { status: 'irrelevant', state: domain };
  return { status: 'committed', state: { quests: changedQuests }, transitions };
}

// --- internals ---------------------------------------------------------------

interface StepOutcome {
  next: QuestState;
  transition: QuestTransition | null;
}

function applyEventToQuest(
  quest: QuestState,
  manifest: QuestManifest,
  event: DomainEvent
): StepOutcome {
  if (quest.status !== 'active') return { next: quest, transition: null };
  if (quest.processedEventIds.includes(event.id)) return { next: quest, transition: null };

  let objectives = quest.objectives;
  let anyChanged = false;
  let anyCompleted = false;
  const touched: string[] = [];

  for (const obj of manifest.objectives) {
    if (!matchObjective(obj, event)) continue;
    const current = objectives[obj.id];
    if (current === undefined || current.complete) continue;
    const key = matchedKeyFor(obj, event);
    if (obj.type === 'collect_evidence') {
      if (current.matchedKeys.includes(key)) continue;
      const nextKeys = [...current.matchedKeys, key];
      const complete = (obj.evidenceIds ?? []).every((id) => nextKeys.includes(id));
      objectives = {
        ...objectives,
        [obj.id]: { objectiveId: obj.id, complete, matchedKeys: nextKeys },
      };
    } else {
      objectives = {
        ...objectives,
        [obj.id]: { objectiveId: obj.id, complete: true, matchedKeys: [key] },
      };
    }
    anyChanged = true;
    if (objectives[obj.id]?.complete === true) anyCompleted = true;
    touched.push(obj.id);
  }

  if (!anyChanged) return { next: quest, transition: null };

  const resolved = allRequiredComplete(manifest, objectives);
  const status: QuestState['status'] = resolved
    ? manifest.resolution.onAllRequiredComplete
    : quest.status;
  const seq = quest.nextTransitionOrdinal;
  const transitionId = makeTransitionId(quest.questId, seq);
  const kind: QuestTransitionKind = resolved
    ? 'quest_resolved'
    : anyCompleted
      ? 'objective_completed'
      : 'objective_progressed';

  const transition: QuestTransition = {
    transitionId,
    kind,
    questId: quest.questId,
    seq,
    eventId: event.id,
    objectiveIds: touched,
    ...(resolved ? { resolution: manifest.resolution } : {}),
  };
  const entry: QuestHistoryEntry = {
    kind,
    questId: quest.questId,
    transitionId,
    seq,
    eventId: event.id,
    objectiveIds: touched,
    ...(resolved ? { resolution: manifest.resolution } : {}),
  };
  const next: QuestState = {
    questId: quest.questId,
    status,
    objectives,
    processedEventIds: [...quest.processedEventIds, event.id],
    nextTransitionOrdinal: seq + 1,
    history: [...quest.history, entry],
  };
  return { next, transition };
}

function allRequiredComplete(
  manifest: QuestManifest,
  objectives: Record<string, QuestState['objectives'][string]>
): boolean {
  return manifest.objectives.every((obj) => !obj.required || objectives[obj.id]?.complete === true);
}

function commitStep(
  domain: QuestSavedState,
  quest: QuestState,
  kind: QuestTransitionKind,
  opts: { nextStatus: QuestState['status'] }
): QuestStepResult {
  const seq = quest.nextTransitionOrdinal;
  const transitionId = makeTransitionId(quest.questId, seq);
  const transition: QuestTransition = {
    transitionId,
    kind,
    questId: quest.questId,
    seq,
    objectiveIds: [],
  };
  const entry: QuestHistoryEntry = { kind, questId: quest.questId, transitionId, seq };
  const next: QuestState = {
    ...quest,
    status: opts.nextStatus,
    nextTransitionOrdinal: seq + 1,
    history: [...quest.history, entry],
  };
  return {
    status: 'committed',
    state: { quests: { ...domain.quests, [quest.questId]: next } },
    transitions: [transition],
  };
}

function seedQuest(manifest: QuestManifest): QuestState {
  const objectives: Record<string, QuestState['objectives'][string]> = {};
  for (const obj of manifest.objectives) {
    objectives[obj.id] = { objectiveId: obj.id, complete: false, matchedKeys: [] };
  }
  return {
    questId: manifest.id,
    status: manifest.initialState,
    objectives,
    processedEventIds: [],
    nextTransitionOrdinal: 1,
    history: [],
  };
}

function makeTransitionId(questId: string, seq: number): string {
  return `quest:${questId}#${String(seq)}`;
}

function fail(code: QuestErrorCode, message: string): QuestStepResult {
  return { status: 'error', error: new QuestDomainError(code, message) };
}
