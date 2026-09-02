/**
 * Quest Runtime — core contracts (FS-QUEST-001)
 *
 * Pure TypeScript value contracts for the deterministic, saveable quest
 * runtime (WO-012). Depends only on the events and content domains. No Phaser,
 * React, Zod, or Node.js built-ins (verified by the WO-012 purity test).
 *
 * Canonicity (WO-012 plan-review corrections):
 * - Canonical lifecycle vocabulary: `locked | available | active |
 *   resolved_success | resolved_costly | resolved_failure | archived`. Content
 *   `initialState` is restricted to `locked | available | active`
 *   (WO-010 narrow correction) and is only a seeding value.
 * - Per-quest exact-once ledger: an `EventId` progresses a quest at most once;
 *   the same occurrence may advance several quests once each. There is no
 *   global ledger and no Event Sourcing.
 * - Transitions carry meaningful facts only (no placeholder reward/journal
 *   outputs). The journal is a pure projection, never persisted.
 */

import type { QuestObjectiveKind, QuestResolution } from '../content';

/** Full runtime lifecycle. Terminal states never regress. */
export type QuestStatus =
  | 'locked'
  | 'available'
  | 'active'
  | 'resolved_success'
  | 'resolved_costly'
  | 'resolved_failure'
  | 'archived';

/** Compact per-objective progress: an unordered set of semantic keys. */
export interface QuestObjectiveState {
  objectiveId: string;
  complete: boolean;
  matchedKeys: string[];
}

/** Factual surface of one committed quest step. */
export type QuestTransitionKind =
  | 'quest_started'
  | 'objective_progressed'
  | 'objective_completed'
  | 'quest_resolved'
  | 'quest_archived';

/** Prose-free history entry aligned 1:1 with committed transitions. */
export interface QuestHistoryEntry {
  kind: QuestTransitionKind;
  questId: string;
  transitionId: string;
  seq: number;
  eventId?: string;
  objectiveIds?: string[];
  resolution?: QuestResolution;
}

/** The only persisted quest state. Contains stable IDs and JSON-safe values. */
export interface QuestState {
  questId: string;
  status: QuestStatus;
  objectives: Record<string, QuestObjectiveState>;
  /** Per-quest exact-once occurrence ledger (progressing events only). */
  processedEventIds: string[];
  nextTransitionOrdinal: number;
  history: QuestHistoryEntry[];
}

/** Whole-quest-domain state handed to and returned by every step. */
export interface QuestSavedState {
  quests: Record<string, QuestState>;
}

/** One observable fact produced by a committed step (≤1 per quest per step). */
export interface QuestTransition {
  transitionId: string;
  kind: QuestTransitionKind;
  questId: string;
  seq: number;
  /** Present on event-driven steps. */
  eventId?: string;
  /** Objectives touched by this step. */
  objectiveIds: string[];
  /** Present iff kind === 'quest_resolved'. */
  resolution?: QuestResolution;
}

/** Read view for the journal UI; recomputed on demand, never persisted. */
export interface QuestJournalView {
  questId: string;
  titleKey: string;
  status: QuestStatus;
  startKey: string;
  completeKey: string;
  resolution?: QuestResolution;
  objectives: {
    id: string;
    type: QuestObjectiveKind;
    required: boolean;
    complete: boolean;
  }[];
  latestTransitionId?: string;
}

// --- Errors -----------------------------------------------------------------

export type QuestErrorCode =
  | 'unknown-quest'
  | 'quest-locked'
  | 'already-active'
  | 'quest-terminal'
  | 'invalid-transition'
  | 'impossible-required-objective'
  | 'malformed-content';

/** Typed runtime error. Consumers use `.code`; the previous state is untouched. */
export class QuestDomainError extends Error {
  readonly code: QuestErrorCode;

  constructor(code: QuestErrorCode, message: string) {
    super(message);
    this.name = 'QuestDomainError';
    this.code = code;
  }
}

// --- Results ----------------------------------------------------------------

export interface QuestApplyCommittedResult {
  status: 'committed';
  state: QuestSavedState;
  transitions: QuestTransition[];
}

export interface QuestApplyIrrelevantResult {
  status: 'irrelevant';
  state: QuestSavedState;
}

/** applyEvent only: any registered-but-unmatched event leaves quests unchanged. */
export type QuestApplyResult = QuestApplyCommittedResult | QuestApplyIrrelevantResult;

export type QuestStepResult =
  | { status: 'committed'; state: QuestSavedState; transitions: QuestTransition[] }
  | { status: 'error'; error: QuestDomainError };

export type QuestInitResult =
  | { status: 'committed'; state: QuestSavedState; initializedQuestIds: string[] }
  | { status: 'unchanged'; state: QuestSavedState }
  | { status: 'error'; state: QuestSavedState; error: QuestDomainError };
