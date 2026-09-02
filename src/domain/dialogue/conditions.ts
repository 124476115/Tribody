/**
 * Dialogue Runtime — condition evaluation (FS-DIALOGUE-001)
 *
 * Evaluates the WO-010 condition DSL over a read-only `DialogueSnapshot`.
 * Any condition kind that is not part of the approved set aborts with
 * `unknown-condition-kind` (defense-in-depth; content validation is the first
 * fence).
 */
import type { Condition } from '../content';
import { DialogueDomainError, type DialogueSnapshot } from './types';

export function evaluateCondition(condition: Condition, snapshot: DialogueSnapshot): boolean {
  switch (condition.kind) {
    case 'flag':
      return snapshot.flags[condition.flag] === true;
    case 'quest_state':
      return snapshot.questStates[condition.questId] === condition.state;
    case 'relationship_at_least': {
      const scores = snapshot.relationships[condition.npcId];
      const value = scores === undefined ? 0 : scores[condition.dimension];
      return (value ?? 0) >= condition.min;
    }
    case 'skill_at_least':
      return (snapshot.skillValues[condition.skillId] ?? 0) >= condition.value;
    case 'has_item': {
      const count = snapshot.itemCounts[condition.itemId] ?? 0;
      return count >= (condition.count ?? 1);
    }
    case 'has_codex':
      return snapshot.codexUnlocked[condition.codexId] === true;
    case 'chapter_state':
      return snapshot.activeChapterId === condition.chapterId;
    default:
      return assertUnknownConditionKind(condition);
  }
}

export function evaluateConditions(
  conditions: readonly Condition[],
  snapshot: DialogueSnapshot
): boolean {
  return conditions.every((condition) => evaluateCondition(condition, snapshot));
}

function assertUnknownConditionKind(condition: never): never {
  const kind = (condition as unknown as { kind?: string }).kind;
  throw new DialogueDomainError(
    'unknown-condition-kind',
    `unknown condition kind "${kind ?? '<missing>'}"`
  );
}
