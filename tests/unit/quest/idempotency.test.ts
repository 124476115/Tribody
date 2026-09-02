/**
 * FS-QUEST-001 — AC-04/AC-05 per-quest exact-once idempotency:
 *  - one EventId advances two active quests once each;
 *  - redelivery never re-progresses either quest (per-quest ledgers);
 *  - set-based evidence objectives never double-count a semantic key.
 */
import { describe, it, expect } from 'vitest';
import {
  createQuestDomain,
  questApplyEvent,
  questInit,
  questStart,
  type QuestSavedState,
} from '../../../src/domain/quest';
import type { QuestManifest } from '../../../src/domain/content';
import { domainEvent, objective, quest, secondQuest } from '../../helpers/quest-fixtures';

function setupActive(pairs: Record<string, QuestManifest>): QuestSavedState {
  const init = questInit(createQuestDomain(), pairs);
  if (init.status !== 'committed') throw new Error('init failed');
  let domain = init.state;
  for (const id of Object.keys(pairs)) {
    const started = questStart(domain, pairs, { questId: id });
    if (started.status !== 'committed') throw new Error('start failed');
    domain = started.state;
  }
  return domain;
}

describe('WO-012 per-quest idempotency', () => {
  it('AC-04: givenOneEventMatchesTwoActiveQuests_thenBothAdvanceExactlyOnce', () => {
    const a = quest('q_a', {
      objectives: [
        objective('oa', 'wait_for_event', { listensFor: ['ch04.raw_data_compare_requested'] }),
      ],
    });
    const b = secondQuest();
    const pairs = { [a.id]: a, [b.id]: b };
    const domain = setupActive(pairs);

    const r = questApplyEvent(
      domain,
      pairs,
      domainEvent('evt-shared', 'ch04.raw_data_compare_requested')
    );
    expect(r.status).toBe('committed');
    if (r.status !== 'committed') throw new Error('not committed');
    expect(r.transitions).toHaveLength(2);
    const byQuest = new Map(r.transitions.map((t) => [t.questId, t]));
    expect(byQuest.get(a.id)?.eventId).toBe('evt-shared');
    expect(byQuest.get(b.id)?.eventId).toBe('evt-shared');
    for (const qid of [a.id, b.id]) {
      const state = r.state.quests[qid];
      expect(state?.processedEventIds).toEqual(['evt-shared']);
      expect(state?.status).toBe('resolved_success');
    }
  });

  it('AC-04: givenSameEventRedelivered_thenEachQuestDoesNotDoubleProgress', () => {
    const a = quest('q_a', {
      objectives: [
        objective('oa', 'wait_for_event', { listensFor: ['ch04.raw_data_compare_requested'] }),
      ],
    });
    const b = secondQuest();
    const pairs = { [a.id]: a, [b.id]: b };
    const domain = setupActive(pairs);

    const first = questApplyEvent(
      domain,
      pairs,
      domainEvent('evt-shared', 'ch04.raw_data_compare_requested')
    );
    if (first.status !== 'committed') throw new Error('not committed');

    const redelivered = questApplyEvent(
      first.state,
      pairs,
      domainEvent('evt-shared', 'ch04.raw_data_compare_requested')
    );
    expect(redelivered.status).toBe('irrelevant');
    if (redelivered.status !== 'irrelevant') throw new Error('not irrelevant');
    expect(redelivered.state).toBe(first.state);
    for (const qid of [a.id, b.id]) {
      const state = redelivered.state.quests[qid];
      expect(state?.processedEventIds).toEqual(['evt-shared']); // still length 1
      expect(state?.nextTransitionOrdinal).toBe(3); // started(1), resolved(2)
    }
  });

  it('AC-05: givenTwoEventIdsSameEvidenceKey_doNotDoubleCount', () => {
    const m = quest('q_ev', {
      objectives: [objective('obj_cam', 'collect_evidence', { evidenceIds: ['ev_a', 'ev_b'] })],
    });
    const pairs = { [m.id]: m };
    const domain = setupActive(pairs);

    const first = questApplyEvent(
      domain,
      pairs,
      domainEvent('evt-1', 'evidence.collected', { evidenceId: 'ev_a' })
    );
    if (first.status !== 'committed') throw new Error('first must commit');

    // A different EventId carrying the SAME evidence key adds nothing.
    const secondDelivery = questApplyEvent(
      first.state,
      pairs,
      domainEvent('evt-2', 'evidence.collected', { evidenceId: 'ev_a' })
    );
    expect(secondDelivery.status).toBe('irrelevant');
    if (secondDelivery.status !== 'irrelevant') throw new Error('not irrelevant');
    const after = secondDelivery.state.quests[m.id];
    expect(after?.objectives['obj_cam']?.matchedKeys).toEqual(['ev_a']);
    expect(after?.objectives['obj_cam']?.complete).toBe(false);
    expect(after?.processedEventIds).toEqual(['evt-1']);
    expect(after?.nextTransitionOrdinal).toBe(3); // started(1), first key received(2)
  });

  it('AC-05: givenAllRequiredEvidenceKeys_thenObjectiveCompletes', () => {
    const m = quest('q_ev', {
      objectives: [objective('obj_cam', 'collect_evidence', { evidenceIds: ['ev_a', 'ev_b'] })],
    });
    const pairs = { [m.id]: m };
    const domain = setupActive(pairs);

    const first = questApplyEvent(
      domain,
      pairs,
      domainEvent('evt-1', 'evidence.collected', { evidenceId: 'ev_a' })
    );
    if (first.status !== 'committed') throw new Error('first must commit');

    const second = questApplyEvent(
      first.state,
      pairs,
      domainEvent('evt-2', 'evidence.collected', { evidenceId: 'ev_b' })
    );
    expect(second.status).toBe('committed');
    if (second.status !== 'committed') throw new Error('second must commit');
    const state = second.state.quests[m.id];
    expect(state?.objectives['obj_cam']?.complete).toBe(true);
    expect(state?.objectives['obj_cam']?.matchedKeys).toEqual(['ev_a', 'ev_b']);
    expect(state?.status).toBe('resolved_success');
    expect(second.transitions[0]?.kind).toBe('quest_resolved');
  });
});
