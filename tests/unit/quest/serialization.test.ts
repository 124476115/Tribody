/**
 * FS-QUEST-001 — AC-09 snapshot serialization: QuestSavedState survives
 * JSON round-trips exactly, a restored state continues identically to a fresh
 * equivalent run, and restored per-quest ledgers still prevent reprocessing.
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
import { domainEvent, objective, quest } from '../../helpers/quest-fixtures';

function fresh(pairs: Record<string, QuestManifest>): QuestSavedState {
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

const RAMP: QuestManifest = quest('q_ramp', {
  objectives: [
    objective('obj_a', 'collect_evidence', { evidenceIds: ['ev_a', 'ev_b'] }),
    objective('obj_c', 'wait_for_event', { listensFor: ['ch04.compare'] }),
  ],
});

describe('WO-012 serialization', () => {
  it('AC-09: JSON round-trip preserves the exact state', () => {
    let domain = fresh({ [RAMP.id]: RAMP });
    const step1 = questApplyEvent(
      domain,
      { [RAMP.id]: RAMP },
      domainEvent('evt-1', 'evidence.collected', { evidenceId: 'ev_a' })
    );
    if (step1.status !== 'committed') throw new Error('step1');
    domain = step1.state;

    const restored = JSON.parse(JSON.stringify(domain)) as QuestSavedState;
    expect(restored).toEqual(domain);
  });

  it('AC-09: a restored state continues ahead exactly like a fresh equivalent run', () => {
    const run = (): QuestSavedState => {
      const domain = fresh({ [RAMP.id]: RAMP });
      const a = questApplyEvent(
        domain,
        { [RAMP.id]: RAMP },
        domainEvent('evt-1', 'evidence.collected', { evidenceId: 'ev_a' })
      );
      if (a.status !== 'committed') throw new Error('a');
      const c = questApplyEvent(a.state, { [RAMP.id]: RAMP }, domainEvent('evt-2', 'ch04.compare'));
      if (c.status !== 'committed') throw new Error('c');
      return c.state;
    };

    // Fresh run, serialized at the midpoint, then restored and finished.
    const domain = fresh({ [RAMP.id]: RAMP });
    const midpoint = questApplyEvent(
      domain,
      { [RAMP.id]: RAMP },
      domainEvent('evt-1', 'evidence.collected', { evidenceId: 'ev_a' })
    );
    if (midpoint.status !== 'committed') throw new Error('midpoint');
    const restored = JSON.parse(JSON.stringify(midpoint.state)) as QuestSavedState;
    const finishedFromRestore = questApplyEvent(
      restored,
      { [RAMP.id]: RAMP },
      domainEvent('evt-2', 'ch04.compare')
    );

    const finishedFresh = run();
    if (finishedFromRestore.status !== 'committed') throw new Error('restore finish');
    expect(JSON.stringify(finishedFromRestore.state)).toBe(JSON.stringify(finishedFresh));
  });

  it('AC-09: restored per-quest ledgers still prevent reprocessing', () => {
    const a = quest('q_a', {
      objectives: [objective('oa', 'wait_for_event', { listensFor: ['ch04.signal'] })],
    });
    const b = quest('q_b', {
      objectives: [objective('ob', 'wait_for_event', { listensFor: ['ch04.signal'] })],
    });
    const pairs = { [a.id]: a, [b.id]: b };
    const domain = fresh(pairs);
    const first = questApplyEvent(domain, pairs, domainEvent('evt-shared', 'ch04.signal'));
    if (first.status !== 'committed') throw new Error('first');

    // Restore before delivering; only quest B still needs the occurrence.
    const restored = JSON.parse(JSON.stringify(first.state)) as QuestSavedState;
    const redelivery = questApplyEvent(restored, pairs, domainEvent('evt-shared', 'ch04.signal'));
    expect(redelivery.status).toBe('irrelevant');
    for (const qid of [a.id, b.id]) {
      expect(redelivery.state.quests[qid]?.processedEventIds).toEqual(['evt-shared']);
    }
  });

  it('AC-09: a fresh event id with a new sequence still advances the restored quest', () => {
    const domain = fresh({ [RAMP.id]: RAMP });
    const goal = questApplyEvent(
      domain,
      { [RAMP.id]: RAMP },
      domainEvent('evt-1', 'evidence.collected', { evidenceId: 'ev_a' })
    );
    if (goal.status !== 'committed') throw new Error('mid');
    const restored = JSON.parse(JSON.stringify(goal.state)) as QuestSavedState;
    const finish = questApplyEvent(
      restored,
      { [RAMP.id]: RAMP },
      domainEvent('evt-2', 'evidence.collected', { evidenceId: 'ev_b' })
    );
    expect(finish.status).toBe('committed');
    if (finish.status !== 'committed') throw new Error('finish');
    expect(finish.transitions[0]?.kind).toBe('objective_completed');
    expect(finish.state.quests[RAMP.id]?.objectives['obj_a']?.complete).toBe(true);
  });
});
