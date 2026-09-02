/**
 * Dialogue Runtime — core contracts (FS-DIALOGUE-001)
 *
 * Pure TypeScript value contracts for the deterministic, saveable dialogue
 * runtime. Depends only on the content domain contracts. No Phaser, React,
 * Zod, or Node.js built-ins (verified by the WO-011 purity test).
 *
 * Identity rules (WO-011 plan-review correction #1):
 * - request identity: opaque caller-supplied `requestId`, deduped via the
 *   persisted `processedRequestIds` ledger;
 * - transition identity: session-local monotonic ordinal, NOT derived from
 *   node+choice, so a legitimate loop that revisits the same node/choice never
 *   collides.
 */

import type { Effect } from '../content';

/** Sentinel value used by authored content to terminate a conversation. */
export const DIALOGUE_END = 'end';

/** Full runtime modes. `idle` is "no active session". */
export type DialogueMode = 'idle' | 'onNode' | 'awaitingSkillCheck' | 'ended';

/** Modes a persisted session may hold. There is no persisted `failed` mode. */
export type DialogueSessionMode = 'onNode' | 'awaitingSkillCheck' | 'ended';

/** Read-only world projection used for condition evaluation. Fully JSON-safe. */
export interface DialogueSnapshot {
  activeChapterId: string;
  activeSceneId: string;
  flags: Readonly<Record<string, boolean>>;
  questStates: Readonly<Record<string, string>>;
  relationships: Readonly<Record<string, Readonly<Record<string, number>>>>;
  skillValues: Readonly<Record<string, number>>;
  itemCounts: Readonly<Record<string, number>>;
  codexUnlocked: Readonly<Record<string, boolean>>;
}

/** Minimal skill-check routing hook exposed by the runtime; WO-021 owns policy. */
export interface SkillCheckRequest {
  dialogueId: string;
  instanceOrdinal: number;
  nodeId: string;
  choiceId: string;
  skillId: string;
  threshold: number;
}

export type DialogueHistoryKind = 'started' | 'node_entered' | 'choice_selected' | 'ended';

/** Compact, prose-free history entry (store IDs, never rendered text). */
export interface DialogueHistoryEntry {
  kind: DialogueHistoryKind;
  dialogueId: string;
  transitionId: string;
  seq: number;
  nodeId?: string;
  choiceId?: string;
  outcome?: 'passed' | 'failed';
}

/** Pin of the choice that parks a conversation while its skill check resolves. */
export interface DialoguePendingCheck {
  nodeId: string;
  choiceId: string;
}

/** The only persisted dialogue state. Contains only stable IDs and JSON-safe values. */
export interface DialogueSessionState {
  dialogueId: string;
  instanceOrdinal: number;
  mode: DialogueSessionMode;
  nodeId: string | null;
  pendingCheck: DialoguePendingCheck | null;
  nextTransitionOrdinal: number;
  history: DialogueHistoryEntry[];
}

/** Whole-dialogue-domain state handed to and returned by every step. */
export interface DialogueSavedState {
  active: DialogueSessionState | null;
  processedRequestIds: string[];
  nextInstanceOrdinal: Record<string, number>;
}

/**
 * A whitelisted effect request bound to one committed transition.
 * `instanceId = <transitionId>:<index>` is stable across replays.
 */
export type EffectRequest = Effect & { instanceId: string };

export type DialogueTransitionKind =
  'started' | 'node_entered' | 'choice_selected' | 'skill_check_requested' | 'ended';

/**
 * The observable output of one committed step: identity, what changed, the
 * newly-emitted effect requests, and voice-cue exposure (no playback).
 */
export interface DialogueTransition {
  transitionId: string;
  kind: DialogueTransitionKind;
  dialogueId: string;
  sourceNodeId: string | null;
  targetNodeId: string | null;
  choiceId?: string;
  outcome?: 'passed' | 'failed';
  effects: EffectRequest[];
  voiceCueIds: string[];
  skillCheck?: SkillCheckRequest;
}

/** Read-view for future UI. Recomputed on demand; never persisted. */
export interface ChoiceView {
  id: string;
  textKey: string;
  enabled: boolean;
  hasSkillCheck: boolean;
}

export interface DialogueView {
  dialogueId: string;
  mode: DialogueMode;
  nodeId: string | null;
  speaker: string;
  textKey: string;
  voiceCueId?: string;
  portraitState?: string;
  tags: string[];
  choices: ChoiceView[];
}

// --- Intents (state-changing; the opaque requestId is caller-supplied) ------

export interface StartIntent {
  requestId: string;
  dialogueId: string;
}

export interface SelectIntent {
  requestId: string;
  choiceId: string;
}

export interface AdvanceIntent {
  requestId: string;
}

export interface ResolveSkillCheckIntent {
  requestId: string;
  choiceId: string;
  outcome: 'passed' | 'failed';
}

export interface EndIntent {
  requestId: string;
}

// --- Errors ----------------------------------------------------------------

export type DialogueErrorCode =
  | 'not-active'
  | 'already-active'
  | 'unknown-dialogue'
  | 'malformed-content'
  | 'invalid-transition'
  | 'self-loop'
  | 'canon-protected-effect'
  | 'unknown-condition-kind';

/** Typed runtime error. Consumers use `.code`; the previous state is untouched. */
export class DialogueDomainError extends Error {
  readonly code: DialogueErrorCode;

  constructor(code: DialogueErrorCode, message: string) {
    super(message);
    this.name = 'DialogueDomainError';
    this.code = code;
  }
}

// --- Results ---------------------------------------------------------------

export interface DialogueCommittedResult {
  status: 'committed';
  state: DialogueSavedState;
  transition: DialogueTransition;
}

export interface DialogueDuplicateResult {
  status: 'duplicate';
  state: DialogueSavedState;
}

export interface DialogueErrorResult {
  status: 'error';
  error: DialogueDomainError;
}

export type DialogueResult =
  DialogueCommittedResult | DialogueDuplicateResult | DialogueErrorResult;
