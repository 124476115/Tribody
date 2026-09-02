/**
 * Quest Runtime — objective matching (FS-QUEST-001)
 *
 * Two matching families:
 * - semantic: `listensFor` matches `DomainEvent.type` only (never `event.id`);
 * - structured: a canonical event type + scoped payload contract.
 *
 * Kinds without a default contract (`analyze`, `wait_for_event`, `repair`,
 * `escort`, `survive`) can only be reached semantically; `questInit` rejects
 * REQUIRED objectives with no reachable rule (AC-12).
 */
import type { JSONValue } from '../events';
import type { DomainEvent } from '../events';
import type { QuestObjectiveKind, QuestObjectiveManifest } from '../content';

/** How an objective can be advanced. `none` is unreachable. */
export type MatchOrigin = 'semantic' | 'structured' | 'none';

interface StructuredContract {
  type: string;
  scopeField: string;
}

/**
 * Canonical structured-event contracts (names from docs/04 §3). Owning systems
 * (exploration/inventory WOs) must confirm these before their own delivery.
 */
const STRUCTURED_DEFAULT: Partial<Record<QuestObjectiveKind, StructuredContract>> = {
  collect_evidence: { type: 'evidence.collected', scopeField: 'evidenceId' },
  talk: { type: 'npc.talked', scopeField: 'npcId' },
  go_to: { type: 'scene.entered', scopeField: 'sceneId' },
  interact: { type: 'world.interaction', scopeField: 'sceneId' },
  choose: { type: 'dialogue.choice_selected', scopeField: 'dialogueId' },
};

/** Whether an objective is reachable at all (AC-12 listenability). */
export function objectiveMatchOrigin(objective: QuestObjectiveManifest): MatchOrigin {
  if (objective.listensFor !== undefined && objective.listensFor.length > 0) {
    return 'semantic';
  }
  const def = STRUCTURED_DEFAULT[objective.type];
  if (def === undefined) return 'none';
  if (objective.type === 'collect_evidence') {
    return objective.evidenceIds !== undefined && objective.evidenceIds.length > 0
      ? 'structured'
      : 'none';
  }
  return objectiveScopeId(objective.type, objective) !== undefined ? 'structured' : 'none';
}

/** Pure predicate: does this event match this objective rule? */
export function matchObjective(objective: QuestObjectiveManifest, event: DomainEvent): boolean {
  if (objective.listensFor !== undefined && objective.listensFor.length > 0) {
    return objective.listensFor.includes(event.type);
  }
  const def = STRUCTURED_DEFAULT[objective.type];
  if (def === undefined) return false;
  if (event.type !== def.type) return false;
  const scope = payloadStringValue(event.payload, def.scopeField);
  if (scope === undefined) return false;
  if (objective.type === 'collect_evidence') {
    return (objective.evidenceIds ?? []).includes(scope);
  }
  return scope === objectiveScopeId(objective.type, objective);
}

/** The semantic key an objective records for a matched event. */
export function matchedKeyFor(objective: QuestObjectiveManifest, event: DomainEvent): string {
  if (objective.listensFor !== undefined && objective.listensFor.length > 0) {
    return event.type;
  }
  const def = STRUCTURED_DEFAULT[objective.type];
  if (def !== undefined) {
    const scope = payloadStringValue(event.payload, def.scopeField);
    if (scope !== undefined) return scope;
  }
  return event.type;
}

function objectiveScopeId(
  type: QuestObjectiveKind,
  objective: QuestObjectiveManifest
): string | undefined {
  switch (type) {
    case 'talk':
      return objective.npcId;
    case 'go_to':
    case 'interact':
      return objective.sceneId;
    case 'choose':
      return objective.dialogueId;
    default:
      return undefined;
  }
}

function payloadStringValue(payload: JSONValue, field: string): string | undefined {
  if (payload === null || Array.isArray(payload) || typeof payload !== 'object') {
    return undefined;
  }
  const value = (payload as Record<string, JSONValue>)[field];
  return typeof value === 'string' ? value : undefined;
}
