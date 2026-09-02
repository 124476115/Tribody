/**
 * FS-QUEST-001 — AC-10 determinism: equivalent inputs (order-equivalent manifest
 * maps + an identical event sequence) produce identical transitions and
 * identical serialized bytes.
 */
import { describe, it, expect } from 'vitest';
import {
  createQuestDomain,
  questApplyEvent,
  questInit,
  questStart,
  type QuestApplyResult,
  type QuestSavedState,
} from '../../../src/domain/quest';
import type { QuestManifest } from '../../../src/domain/content';
import { domainEvent, objective, quest } from '../../helpers/quest-fixtures';

function runAgainst(pairs: Record<string, QuestManifest>): {
  transitionIds: string[];
  historyCount: number;
  finalSerialized: string;
} {
  const init = questInit(createQuestDomain(), pairs);
  if (init.status !== 'committed') throw new Error('init failed');
  let domain: QuestSavedState = init.state;
  const transitionIds: string[] = [];
  for (const id of Object.keys(pairs)) {
    const started = questStart(domain, pairs, { questId: id });
    if (started.status !== 'committed') throw new Error('start failed');
    transitionIds.push(started.transitions[0]?.transitionId ?? '');
    domain = started.state;
  }
  for (const event of [
    domainEvent('evt-1', 'evidence.collected', { evidenceId: 'ev_a' }),
    domainEvent('evt-2', 'ch04.compare'),
    domainEvent('evt-3', 'npc.talked', { npcId: 'npc_a' }),
  ]) {
    const r = questApplyEvent(domain, pairs, event);
    if (r.status === 'committed') {
      for (const t of r.transitions) transitionIds.push(t.transitionId);
      domain = r.state;
    }
  }
  const historyCount = Object.values(domain.quests).reduce((n, q) => n + q.history.length, 0);
  return {
    transitionIds,
    historyCount,
    finalSerialized: JSON.stringify(domain),
  };
}

const BASE: QuestManifest = quest('q_det', {
  objectives: [
    objective('obj_a', 'collect_evidence', { evidenceIds: ['ev_a', 'ev_b'] }),
    objective('obj_c', 'wait_for_event', { listensFor: ['ch04.compare'] }),
    objective('obj_t', 'talk', { npcId: 'npc_a' }),
  ],
});

function reversed(pairs: Record<string, QuestManifest>): Record<string, QuestManifest> {
  const out: Record<string, QuestManifest> = {};
  for (const [id, manifest] of Object.entries(pairs).reverse()) out[id] = manifest;
  return out;
}

describe('WO-012 determinism', () => {
  it('AC-10: manifest insertion order does not affect transitions or serialized state', () => {
    const pairs = { q_z: quest('q_z'), q_a: quest('q_a'), [BASE.id]: BASE };
    const forward = runAgainst(pairs);
    const backward = runAgainst(reversed(pairs));

    // transition ids are unique per quest, so multiset equality is exact-once;
    // the serialized state is the order-independent source of truth.
    expect([...backward.transitionIds].sort()).toEqual([...forward.transitionIds].sort());
    expect(backward.historyCount).toBe(forward.historyCount);
    expect(backward.finalSerialized).toBe(forward.finalSerialized);
  });

  it('AC-10: an identical event sequence yields identical transitions and bytes', () => {
    const pairs = { [BASE.id]: BASE };
    const first = runAgainst(pairs);
    const second = runAgainst({ ...pairs });
    expect(second).toEqual(first);
  });

  it('AC-10: irrelevant events never touch the serialized state', () => {
    let domain = createQuestDomain();
    const init = questInit(domain, { [BASE.id]: BASE });
    if (init.status !== 'committed') throw new Error('init failed');
    domain = init.state;
    const start = questStart(domain, { [BASE.id]: BASE }, { questId: BASE.id });
    if (start.status !== 'committed') throw new Error('start');

    const before = JSON.stringify(start.state);
    const r: QuestApplyResult = questApplyEvent(
      start.state,
      { [BASE.id]: BASE },
      domainEvent('evt-x', 'scene.entered', { sceneId: 'sc_nowhere' })
    );
    if (r.status !== 'irrelevant') throw new Error('expected irrelevant');
    expect(JSON.stringify(r.state)).toBe(before);
  });
});
