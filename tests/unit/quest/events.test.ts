/**
 * FS-QUEST-001 — AC-03/AC-06 event application: one event folds into at most
 * one atomic transition per quest, partial completion keeps a quest active, and
 * registered-but-unmatched events leave every quest unchanged (irrelevant).
 */
import { describe, it, expect } from 'vitest';
import {
  createQuestDomain,
  questApplyEvent,
  questInit,
  questStart,
  type QuestSavedState,
} from '../../../src/domain/quest';
import { domainEvent, objective, quest } from '../../helpers/quest-fixtures';
import { required } from '../../helpers/content-fixtures';

function setupActive(pairs: Record<string, ReturnType<typeof quest>>): QuestSavedState {
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

describe('WO-012 event application', () => {
  it('AC-06: one event matching several objectives folds into a single atomic transition', () => {
    const m = quest('q_multi', {
      objectives: [
        objective('obj_a', 'analyze', { listensFor: ['ch04.raw_data_compare_requested'] }),
        objective('obj_w', 'wait_for_event', { listensFor: ['ch04.raw_data_compare_requested'] }),
        objective('obj_t', 'talk', { npcId: 'npc_b' }),
      ],
    });
    const domain = setupActive({ [m.id]: m });
    const r = questApplyEvent(
      domain,
      { [m.id]: m },
      domainEvent('evt-1', 'ch04.raw_data_compare_requested')
    );
    expect(r.status).toBe('committed');
    if (r.status !== 'committed') throw new Error('not committed');
    expect(r.transitions).toHaveLength(1);
    const t = required(r.transitions[0], 'transition');
    expect(t.questId).toBe(m.id);
    expect(t.eventId).toBe('evt-1');
    expect(t.objectiveIds).toEqual(['obj_a', 'obj_w']);
    expect(t.seq).toBe(2); // ordinal 1 was quest_started
    expect(r.state.quests[m.id]?.status).toBe('active');
    expect(r.state.quests[m.id]?.history).toHaveLength(2);
  });

  it('AC-03: partial completion keeps the quest active until all evidence arrives', () => {
    const m = quest('q_ev', {
      objectives: [
        objective('obj_cam', 'collect_evidence', {
          evidenceIds: ['ev_a', 'ev_b'],
        }),
      ],
    });
    const domain = setupActive({ [m.id]: m });
    const first = questApplyEvent(
      domain,
      { [m.id]: m },
      domainEvent('evt-1', 'evidence.collected', { evidenceId: 'ev_a' })
    );
    if (first.status !== 'committed') throw new Error('first event must commit');
    const questState = first.state.quests[m.id];
    if (questState === undefined) throw new Error('missing quest');
    expect(questState.status).toBe('active');
    expect(questState.objectives['obj_cam']?.complete).toBe(false);
    expect(questState.objectives['obj_cam']?.matchedKeys).toEqual(['ev_a']);
  });

  it('AC-03/05: an irrelevant registered event changes nothing and is irrelevant', () => {
    const m = quest('q_ev', {
      objectives: [
        objective('obj_cam', 'collect_evidence', {
          evidenceIds: ['ev_a'],
        }),
      ],
    });
    const domain = setupActive({ [m.id]: m });
    const r = questApplyEvent(
      domain,
      { [m.id]: m },
      domainEvent('evt-x', 'scene.entered', { sceneId: 'sc_nowhere' })
    );
    expect(r.status).toBe('irrelevant');
    if (r.status !== 'irrelevant') throw new Error('not irrelevant');
    expect(r.state).toBe(domain);
    expect(r.state.quests[m.id]?.processedEventIds).toEqual([]);
  });

  it('AC-03: an event matching content but not this quest is irrelevant (two different quests)', () => {
    const a = quest('q_a', {
      objectives: [objective('oa', 'wait_for_event', { listensFor: ['ch04.signal.a'] })],
    });
    const b = quest('q_b', {
      objectives: [objective('ob', 'wait_for_event', { listensFor: ['ch04.signal.b'] })],
    });
    const domain = setupActive({ [a.id]: a, [b.id]: b });
    const r = questApplyEvent(
      domain,
      { [a.id]: a, [b.id]: b },
      domainEvent('evt-1', 'ch04.signal.a')
    );
    expect(r.status).toBe('committed');
    if (r.status !== 'committed') throw new Error('not committed');
    expect(r.transitions).toHaveLength(1);
    expect(r.transitions[0]?.questId).toBe('q_a');
  });
});
