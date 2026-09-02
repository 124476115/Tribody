/**
 * FS-QUEST-001 — AC-07 resolution semantics: fires exactly once when the last
 * required objective completes (all four resolution targets), pending optional
 * objectives never block, and a resolved quest can never regress or re-resolve.
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
import {
  domainEvent,
  objective,
  quest,
  semanticQuest,
  type QuestResolutionTarget,
} from '../../helpers/quest-fixtures';
import { required } from '../../helpers/content-fixtures';

function activeDomain(pairs: Record<string, QuestManifest>): QuestSavedState {
  const init = questInit(createQuestDomain(), pairs);
  if (init.status !== 'committed') throw new Error('init failed');
  const domain = init.state;
  const started = questStart(domain, pairs, { questId: Object.keys(pairs)[0] ?? '' });
  if (started.status !== 'committed') throw new Error('start failed');
  return started.state;
}

describe('WO-012 resolution', () => {
  it('AC-07: resolves to the manifest target exactly once for every target', () => {
    const targets: QuestResolutionTarget[] = [
      'resolved_success',
      'resolved_costly',
      'resolved_failure',
      'archived',
    ];
    for (const target of targets) {
      const m = semanticQuest('q_res', 'ch04.compare', { onAllRequiredComplete: target });
      const domain = activeDomain({ [m.id]: m });
      const r = questApplyEvent(domain, { [m.id]: m }, domainEvent('evt-1', 'ch04.compare'));
      expect(r.status).toBe('committed');
      if (r.status !== 'committed') throw new Error('not committed');
      const expectedStatus = target === 'archived' ? 'archived' : target;
      expect(r.state.quests[m.id]?.status).toBe(expectedStatus);
      expect(r.transitions).toHaveLength(1);
      const t = required(r.transitions[0], 'transition');
      expect(t.kind).toBe('quest_resolved');
      expect(t.objectiveIds).toEqual(['obj_solo']);
      expect(t.resolution).toEqual({ onAllRequiredComplete: target });
    }
  });

  it('AC-07: pending optional objectives do not block resolution', () => {
    const m = quest('q_opt', {
      objectives: [
        objective('obj_talk', 'talk', { npcId: 'npc_a' }),
        objective('obj_extra', 'collect_evidence', {
          required: false,
          evidenceIds: ['ev_a'],
        }),
      ],
    });
    const domain = activeDomain({ [m.id]: m });
    const r = questApplyEvent(
      domain,
      { [m.id]: m },
      domainEvent('evt-1', 'npc.talked', { npcId: 'npc_a' })
    );
    expect(r.status).toBe('committed');
    if (r.status !== 'committed') throw new Error('not committed');
    expect(r.state.quests[m.id]?.status).toBe('resolved_success');
    expect(r.transitions[0]?.kind).toBe('quest_resolved');
    expect(r.state.quests[m.id]?.objectives['obj_extra']?.complete).toBe(false);
  });

  it('AC-07: once resolved, later events contribute nothing and cannot regress', () => {
    const m = semanticQuest('q_res', 'ch04.compare');
    const domain = activeDomain({ [m.id]: m });
    const resolved = questApplyEvent(domain, { [m.id]: m }, domainEvent('evt-1', 'ch04.compare'));
    if (resolved.status !== 'committed') throw new Error('not committed');

    const after = questApplyEvent(
      resolved.state,
      { [m.id]: m },
      domainEvent('evt-2', 'npc.talked', { npcId: 'npc_a' })
    );
    expect(after.status).toBe('irrelevant');
    if (after.status !== 'irrelevant') throw new Error('not irrelevant');
    expect(after.state.quests[m.id]?.status).toBe('resolved_success');
    expect(after.state.quests[m.id]?.processedEventIds).toEqual(['evt-1']);
    expect(after.state.quests[m.id]?.history).toHaveLength(2);
  });
});
