/**
 * FS-QUEST-001 — AC-11 journal projection: getJournalView derives a read view
 * from QuestState + QuestManifest without mutating anything or persisting prose.
 */
import { describe, it, expect } from 'vitest';
import {
  createQuestDomain,
  getJournalView,
  questApplyEvent,
  questInit,
  questStart,
} from '../../../src/domain/quest';
import { domainEvent, objective, quest } from '../../helpers/quest-fixtures';

describe('WO-012 journal projection', () => {
  it('AC-11: active/progressed quest projects keys, status, and beats', () => {
    const m = quest('q_j', {
      objectives: [
        objective('obj_a', 'collect_evidence', { evidenceIds: ['ev_a', 'ev_b'] }),
        objective('obj_b', 'talk', { npcId: 'npc_a' }),
      ],
    });
    const init = questInit(createQuestDomain(), { [m.id]: m });
    if (init.status !== 'committed') throw new Error('init failed');
    const start = questStart(init.state, { [m.id]: m }, { questId: m.id });
    if (start.status !== 'committed') throw new Error('start');
    const progressed = questApplyEvent(
      start.state,
      { [m.id]: m },
      domainEvent('evt-1', 'evidence.collected', { evidenceId: 'ev_a' })
    );
    if (progressed.status !== 'committed') throw new Error('progress');
    const questState = progressed.state.quests[m.id];
    if (questState === undefined) throw new Error('missing quest');

    const view = getJournalView(questState, m);
    expect(view.questId).toBe(m.id);
    expect(view.titleKey).toBe(m.titleKey);
    expect(view.startKey).toBe(m.journal.startKey);
    expect(view.completeKey).toBe(m.journal.completeKey);
    expect(view.status).toBe('active');
    expect(view.resolution).toBeUndefined();
    expect(view.objectives).toEqual([
      { id: 'obj_a', type: 'collect_evidence', required: true, complete: false },
      { id: 'obj_b', type: 'talk', required: true, complete: false },
    ]);
  });

  it('AC-11: resolved quest projects resolution and the latest transition id', () => {
    const m = quest('q_j2', {
      objectives: [objective('obj_t', 'talk', { npcId: 'npc_a' })],
    });
    const init = questInit(createQuestDomain(), { [m.id]: m });
    if (init.status !== 'committed') throw new Error('init failed');
    const start = questStart(init.state, { [m.id]: m }, { questId: m.id });
    if (start.status !== 'committed') throw new Error('start');
    const resolved = questApplyEvent(
      start.state,
      { [m.id]: m },
      domainEvent('evt-1', 'npc.talked', { npcId: 'npc_a' })
    );
    if (resolved.status !== 'committed') throw new Error('resolve');
    const questState = resolved.state.quests[m.id];
    if (questState === undefined) throw new Error('missing quest');

    const view = getJournalView(questState, m);
    expect(view.status).toBe('resolved_success');
    expect(view.resolution).toEqual({ onAllRequiredComplete: 'resolved_success' });
    expect(view.objectives).toEqual([
      { id: 'obj_t', type: 'talk', required: true, complete: true },
    ]);
    // quest_started = quest:<id>#1, quest_resolved = quest:<id>#2
    expect(view.latestTransitionId).toBe('quest:q_j2#2');
  });

  it('AC-11: projection is pure — reading a view never mutates the state', () => {
    const m = quest('q_j3', {
      objectives: [objective('obj_t', 'talk', { npcId: 'npc_a' })],
    });
    const init = questInit(createQuestDomain(), { [m.id]: m });
    if (init.status !== 'committed') throw new Error('init failed');
    const questState = init.state.quests[m.id];
    if (questState === undefined) throw new Error('missing quest');
    const before = JSON.stringify(questState);
    getJournalView(questState, m);
    getJournalView(questState, m);
    expect(JSON.stringify(questState)).toBe(before);
  });
});
