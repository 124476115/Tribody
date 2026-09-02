/**
 * Dialogue Runtime — deterministic state machine (FS-DIALOGUE-001)
 *
 * Pure, deterministic, fully serializable. One step commits exactly one
 * transition and emits exactly one ordered list of effect requests. Errors are
 * typed results that leave the previous state untouched and consume neither a
 * request id nor a transition ordinal.
 *
 * Design points (WO-011 plan-review corrections):
 * 1. request identity (`requestId` + `processedRequestIds`) vs transition
 *    identity (`dialog:<dialogueId>#<instanceOrdinal>#<ordinal>`) are
 *    separated; loops reuse the same transition formula safely.
 * 2. Skill checks never default: a pending check parks the conversation in
 *    `awaitingSkillCheck` until an explicit resolve arrives.
 * 3. Failed checks advance without choice effects; target onEnter effects
 *    still apply. No invented `failureNext`.
 * 4. There is no persisted `failed` mode (modes: onNode / awaitingSkillCheck /
 *    ended). Errors are returned, never stored.
 * 5. Auto-next is single-step: one advance commits one transition.
 * 6. Effects are emissions (`EffectRequest[]` with stable `instanceId`).
 */
import {
  DIALOGUE_END,
  DialogueDomainError,
  type AdvanceIntent,
  type DialogueErrorCode,
  type DialogueHistoryEntry,
  type DialogueHistoryKind,
  type DialoguePendingCheck,
  type DialogueSavedState,
  type DialogueSessionMode,
  type DialogueSessionState,
  type DialogueSnapshot,
  type DialogueTransition,
  type DialogueTransitionKind,
  type DialogueView,
  type EffectRequest,
  type EndIntent,
  type ResolveSkillCheckIntent,
  type SelectIntent,
  type SkillCheckRequest,
  type StartIntent,
} from './types';
import type { DialogueChoiceManifest, DialogueManifest, Effect as ContentEffect } from '../content';
import { evaluateConditions } from './conditions';
import { translateEffects } from './effects';

export function createDialogueDomain(): DialogueSavedState {
  return createDialogueDomainImpl();
}

export function dialogueStart(
  domain: DialogueSavedState,
  manifest: DialogueManifest,
  intent: StartIntent
): DialogueResult {
  const dup = duplicateGate(domain, intent.requestId);
  if (dup !== null) return dup;
  if (domain.active !== null && domain.active.mode !== 'ended') {
    return fail(
      'already-active',
      `a dialogue session is already active ("${domain.active.dialogueId}")`
    );
  }
  if (manifest.id !== intent.dialogueId) {
    return fail('unknown-dialogue', `no runtime manifest for dialogue "${intent.dialogueId}"`);
  }
  const entryNodeId = manifest.entryNode;
  const entryNode = manifest.nodes[entryNodeId];
  if (entryNode === undefined) {
    return fail(
      'malformed-content',
      `entry node "${entryNodeId}" missing from manifest "${manifest.id}"`
    );
  }
  const instanceOrdinal = (domain.nextInstanceOrdinal[intent.dialogueId] ?? 0) + 1;
  const session: DialogueSessionState = {
    dialogueId: intent.dialogueId,
    instanceOrdinal,
    mode: 'onNode',
    nodeId: entryNodeId,
    pendingCheck: null,
    nextTransitionOrdinal: 1,
    history: [],
  };
  return commit(domain, session, {
    requestId: intent.requestId,
    kind: 'started',
    sourceNodeId: null,
    targetNodeId: entryNodeId,
    effects: entryNode.onEnterEffects,
    voiceCueIds: entryNode.voiceCueId === undefined ? [] : [entryNode.voiceCueId],
    nextMode: 'onNode',
    nextNodeId: entryNodeId,
    pendingCheck: null,
    historyKind: 'started',
    historyNodeId: entryNodeId,
    nextInstanceOrdinal: { ...domain.nextInstanceOrdinal, [intent.dialogueId]: instanceOrdinal },
  });
}

export function dialogueSelect(
  domain: DialogueSavedState,
  manifest: DialogueManifest,
  intent: SelectIntent,
  snapshot: DialogueSnapshot
): DialogueResult {
  const dup = duplicateGate(domain, intent.requestId);
  if (dup !== null) return dup;
  const session = activeSession(domain);
  if (session === null) return fail('not-active', 'no active dialogue session');
  if (session.mode === 'awaitingSkillCheck') {
    return fail('not-active', `dialogue is awaiting a skill check at node "${nodeLabel(session)}"`);
  }
  const nodeId = requireNodeId(session, domain);
  if (nodeId === null) return fail('malformed-content', 'active session has no current node');
  const node = manifest.nodes[nodeId];
  const choice =
    node === undefined ? undefined : node.choices.find((c) => c.id === intent.choiceId);
  if (choice === undefined) {
    return fail(
      'invalid-transition',
      `choice "${intent.choiceId}" is not offered at node "${nodeId}"`
    );
  }
  if (!evaluateConditions(choice.conditions, snapshot)) {
    return fail('invalid-transition', `choice "${intent.choiceId}" is not currently available`);
  }
  if (choice.skillCheck !== undefined) {
    const check: SkillCheckRequest = {
      dialogueId: session.dialogueId,
      instanceOrdinal: session.instanceOrdinal,
      nodeId,
      choiceId: choice.id,
      skillId: choice.skillCheck.skillId,
      threshold: choice.skillCheck.threshold,
    };
    return commit(domain, session, {
      requestId: intent.requestId,
      kind: 'skill_check_requested',
      sourceNodeId: nodeId,
      targetNodeId: nodeId,
      choiceId: choice.id,
      effects: [],
      voiceCueIds: [],
      skillCheck: check,
      nextMode: 'awaitingSkillCheck',
      nextNodeId: nodeId,
      pendingCheck: { nodeId, choiceId: choice.id },
      historyKind: 'choice_selected',
      historyNodeId: nodeId,
      historyChoiceId: choice.id,
      nextInstanceOrdinal: domain.nextInstanceOrdinal,
    });
  }
  return commitChoiceSelection(
    domain,
    session,
    manifest,
    choice,
    undefined,
    intent.requestId,
    domain.nextInstanceOrdinal
  );
}

export function dialogueResolveSkillCheck(
  domain: DialogueSavedState,
  manifest: DialogueManifest,
  intent: ResolveSkillCheckIntent
): DialogueResult {
  const dup = duplicateGate(domain, intent.requestId);
  if (dup !== null) return dup;
  const session = activeSession(domain);
  if (session === null) return fail('not-active', 'no active dialogue session');
  if (session.mode !== 'awaitingSkillCheck') {
    return fail('not-active', 'there is no pending skill check to resolve');
  }
  const pending = session.pendingCheck;
  if (pending === null)
    return fail('malformed-content', 'awaiting mode without a pinned pending check');
  if (pending.choiceId !== intent.choiceId) {
    return fail(
      'invalid-transition',
      `pending skill check targets "${pending.choiceId}", not "${intent.choiceId}"`
    );
  }
  const node = manifest.nodes[pending.nodeId];
  const choice =
    node === undefined ? undefined : node.choices.find((c) => c.id === pending.choiceId);
  if (choice === undefined) {
    return fail(
      'invalid-transition',
      `pending choice "${pending.choiceId}" is missing from the manifest`
    );
  }
  return commitChoiceSelection(
    domain,
    session,
    manifest,
    choice,
    intent.outcome,
    intent.requestId,
    domain.nextInstanceOrdinal
  );
}

export function dialogueAdvance(
  domain: DialogueSavedState,
  manifest: DialogueManifest,
  intent: AdvanceIntent
): DialogueResult {
  const dup = duplicateGate(domain, intent.requestId);
  if (dup !== null) return dup;
  const session = activeSession(domain);
  if (session === null) return fail('not-active', 'no active dialogue session');
  if (session.mode === 'awaitingSkillCheck') {
    return fail('not-active', `dialogue is awaiting a skill check at node "${nodeLabel(session)}"`);
  }
  const nodeId = requireNodeId(session, domain);
  if (nodeId === null) return fail('malformed-content', 'active session has no current node');
  const node = manifest.nodes[nodeId];
  if (node === undefined)
    return fail('malformed-content', `current node "${nodeId}" is missing from the manifest`);
  const autoNext = node.autoNext;
  if (autoNext === undefined) {
    return fail('invalid-transition', `node "${nodeId}" has no autoNext to advance along`);
  }
  if (autoNext === nodeId) {
    return fail('self-loop', `autoNext self-loop at node "${nodeId}"`);
  }
  if (autoNext === DIALOGUE_END) {
    return commit(domain, session, {
      requestId: intent.requestId,
      kind: 'ended',
      sourceNodeId: nodeId,
      targetNodeId: null,
      effects: [],
      voiceCueIds: [],
      nextMode: 'ended',
      nextNodeId: null,
      pendingCheck: null,
      historyKind: 'ended',
      historyNodeId: nodeId,
      nextInstanceOrdinal: domain.nextInstanceOrdinal,
    });
  }
  const target = manifest.nodes[autoNext];
  if (target === undefined) {
    return fail('malformed-content', `autoNext target "${autoNext}" is missing from the manifest`);
  }
  return commit(domain, session, {
    requestId: intent.requestId,
    kind: 'node_entered',
    sourceNodeId: nodeId,
    targetNodeId: autoNext,
    effects: target.onEnterEffects,
    voiceCueIds: target.voiceCueId === undefined ? [] : [target.voiceCueId],
    nextMode: 'onNode',
    nextNodeId: autoNext,
    pendingCheck: null,
    historyKind: 'node_entered',
    historyNodeId: autoNext,
    nextInstanceOrdinal: domain.nextInstanceOrdinal,
  });
}

export function dialogueEnd(domain: DialogueSavedState, intent: EndIntent): DialogueResult {
  const dup = duplicateGate(domain, intent.requestId);
  if (dup !== null) return dup;
  const session = activeSession(domain);
  if (session === null) return fail('not-active', 'no active dialogue session');
  return commit(domain, session, {
    requestId: intent.requestId,
    kind: 'ended',
    sourceNodeId: session.nodeId,
    targetNodeId: null,
    effects: [],
    voiceCueIds: [],
    nextMode: 'ended',
    nextNodeId: null,
    pendingCheck: null,
    historyKind: 'ended',
    ...(session.nodeId === null ? {} : { historyNodeId: session.nodeId }),
    nextInstanceOrdinal: domain.nextInstanceOrdinal,
  });
}

export function getDialogueView(
  session: DialogueSessionState,
  manifest: DialogueManifest,
  snapshot: DialogueSnapshot
): DialogueView {
  const empty = (): DialogueView => ({
    dialogueId: session.dialogueId,
    mode: session.mode,
    nodeId: session.nodeId,
    speaker: '',
    textKey: '',
    tags: [],
    choices: [],
  });
  if (session.nodeId === null) return empty();
  const node = manifest.nodes[session.nodeId];
  if (node === undefined) return empty();
  let choices: ChoiceView[];
  if (session.mode === 'awaitingSkillCheck') {
    const pinned = session.pendingCheck === null ? undefined : session.pendingCheck.choiceId;
    choices = node.choices.map((choice) => ({
      id: choice.id,
      textKey: choice.textKey,
      enabled: choice.id === pinned,
      hasSkillCheck: choice.skillCheck !== undefined,
    }));
  } else {
    choices = node.choices.map((choice) => ({
      id: choice.id,
      textKey: choice.textKey,
      enabled: evaluateConditions(choice.conditions, snapshot),
      hasSkillCheck: choice.skillCheck !== undefined,
    }));
  }
  return {
    dialogueId: session.dialogueId,
    mode: session.mode,
    nodeId: session.nodeId,
    speaker: node.speaker,
    textKey: node.textKey,
    tags: [...node.tags],
    choices,
    ...(node.voiceCueId === undefined ? {} : { voiceCueId: node.voiceCueId }),
    ...(node.portraitState === undefined ? {} : { portraitState: node.portraitState }),
  };
}

export function getPendingSkillCheck(
  session: DialogueSessionState,
  manifest: DialogueManifest
): SkillCheckRequest | null {
  if (session.mode !== 'awaitingSkillCheck' || session.pendingCheck === null) return null;
  const pending = session.pendingCheck;
  const node = manifest.nodes[pending.nodeId];
  const choice =
    node === undefined ? undefined : node.choices.find((c) => c.id === pending.choiceId);
  if (choice?.skillCheck === undefined) return null;
  return {
    dialogueId: session.dialogueId,
    instanceOrdinal: session.instanceOrdinal,
    nodeId: pending.nodeId,
    choiceId: pending.choiceId,
    skillId: choice.skillCheck.skillId,
    threshold: choice.skillCheck.threshold,
  };
}

// --- internals ---------------------------------------------------------------

type DialogueResult =
  | { status: 'committed'; state: DialogueSavedState; transition: DialogueTransition }
  | { status: 'duplicate'; state: DialogueSavedState }
  | { status: 'error'; error: DialogueDomainError };

interface CommitSpec {
  requestId: string;
  kind: DialogueTransitionKind;
  sourceNodeId: string | null;
  targetNodeId: string | null;
  choiceId?: string;
  outcome?: 'passed' | 'failed';
  effects: readonly ContentEffect[];
  voiceCueIds: readonly string[];
  skillCheck?: SkillCheckRequest;
  nextMode: DialogueSessionMode;
  nextNodeId: string | null;
  pendingCheck: DialoguePendingCheck | null;
  historyKind: DialogueHistoryKind;
  historyNodeId?: string;
  historyChoiceId?: string;
  historyOutcome?: 'passed' | 'failed';
  nextInstanceOrdinal: Record<string, number>;
}

function commit(
  domain: DialogueSavedState,
  session: DialogueSessionState,
  spec: CommitSpec
): DialogueResult {
  const ordinal = session.nextTransitionOrdinal;
  const transitionId = makeTransitionId(session.dialogueId, session.instanceOrdinal, ordinal);
  let effects: EffectRequest[];
  try {
    effects = translateEffects(spec.effects, transitionId);
  } catch (error) {
    if (error instanceof DialogueDomainError) {
      return { status: 'error', error };
    }
    throw error;
  }
  const entry: DialogueHistoryEntry = {
    kind: spec.historyKind,
    dialogueId: session.dialogueId,
    transitionId,
    seq: ordinal,
    ...(spec.historyNodeId === undefined ? {} : { nodeId: spec.historyNodeId }),
    ...(spec.historyChoiceId === undefined ? {} : { choiceId: spec.historyChoiceId }),
    ...(spec.historyOutcome === undefined ? {} : { outcome: spec.historyOutcome }),
  };
  const nextState: DialogueSavedState = {
    active: {
      dialogueId: session.dialogueId,
      instanceOrdinal: session.instanceOrdinal,
      mode: spec.nextMode,
      nodeId: spec.nextNodeId,
      pendingCheck: spec.pendingCheck,
      nextTransitionOrdinal: ordinal + 1,
      history: [...session.history, entry],
    },
    processedRequestIds: [...domain.processedRequestIds, spec.requestId],
    nextInstanceOrdinal: spec.nextInstanceOrdinal,
  };
  const transition: DialogueTransition = {
    transitionId,
    kind: spec.kind,
    dialogueId: session.dialogueId,
    sourceNodeId: spec.sourceNodeId,
    targetNodeId: spec.targetNodeId,
    effects,
    voiceCueIds: [...spec.voiceCueIds],
    ...(spec.choiceId === undefined ? {} : { choiceId: spec.choiceId }),
    ...(spec.outcome === undefined ? {} : { outcome: spec.outcome }),
    ...(spec.skillCheck === undefined ? {} : { skillCheck: spec.skillCheck }),
  };
  return { status: 'committed', state: nextState, transition };
}

function makeTransitionId(dialogueId: string, instance: number, ordinal: number): string {
  return `dialog:${dialogueId}#${String(instance)}#${String(ordinal)}`;
}

function duplicateGate(domain: DialogueSavedState, requestId: string): DialogueResult | null {
  if (domain.processedRequestIds.includes(requestId)) {
    return { status: 'duplicate', state: domain };
  }
  return null;
}

function fail(code: DialogueErrorCode, message: string): DialogueResult {
  return { status: 'error', error: new DialogueDomainError(code, message) };
}

function activeSession(domain: DialogueSavedState): DialogueSessionState | null {
  if (domain.active === null || domain.active.mode === 'ended') return null;
  return domain.active;
}

function requireNodeId(session: DialogueSessionState, _domain: DialogueSavedState): string | null {
  return session.nodeId;
}

function nodeLabel(session: DialogueSessionState): string {
  return session.nodeId ?? '<none>';
}

function commitChoiceSelection(
  domain: DialogueSavedState,
  session: DialogueSessionState,
  manifest: DialogueManifest,
  choice: DialogueChoiceManifest,
  outcome: 'passed' | 'failed' | undefined,
  requestId: string,
  nextInstanceOrdinal: Record<string, number>
): DialogueResult {
  const targetId = choice.next;
  let targetEffects: readonly ContentEffect[] = [];
  let voiceCueIds: readonly string[] = [];
  let targetNodeId: string | null = targetId;
  let nextMode: DialogueSessionMode = 'onNode';
  if (targetId === DIALOGUE_END) {
    targetNodeId = null;
    nextMode = 'ended';
  } else {
    const target = manifest.nodes[targetId];
    if (target === undefined) {
      return fail('malformed-content', `choice "${choice.id}" targets missing node "${targetId}"`);
    }
    targetEffects = target.onEnterEffects;
    voiceCueIds = target.voiceCueId === undefined ? [] : [target.voiceCueId];
  }
  const choiceEffects = outcome === 'failed' ? [] : choice.effects;
  return commit(domain, session, {
    requestId,
    kind: 'choice_selected',
    sourceNodeId: session.nodeId,
    targetNodeId,
    choiceId: choice.id,
    ...(outcome === undefined ? {} : { outcome }),
    effects: [...choiceEffects, ...targetEffects],
    voiceCueIds,
    nextMode,
    nextNodeId: targetId === DIALOGUE_END ? null : targetId,
    pendingCheck: null,
    historyKind: 'choice_selected',
    ...(session.nodeId === null ? {} : { historyNodeId: session.nodeId }),
    historyChoiceId: choice.id,
    ...(outcome === undefined ? {} : { historyOutcome: outcome }),
    nextInstanceOrdinal,
  });
}

interface ChoiceView {
  id: string;
  textKey: string;
  enabled: boolean;
  hasSkillCheck: boolean;
}

function createDialogueDomainImpl(): DialogueSavedState {
  return { active: null, processedRequestIds: [], nextInstanceOrdinal: {} };
}
