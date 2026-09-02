/**
 * FS-QUEST-001 — AC-01 questInit: canonical vocabulary, sorted insertion,
 * deterministic seeding, and idempotency ("unchanged" re-init, no reset). The
 * listenability rejection belongs to AC-12 (malformed.test.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  createQuestDomain,
  questInit,
  questStart,
  type QuestInitResult,
} from '../../../src/domain/quest';
import { objective, quest } from '../../helpers/quest-fixtures';

function committed(r: QuestInitResult): QuestInitResult & { status: 'committed' } {
  if (r.status !== 'committed') {
    throw new Error(`expected committed init, got ${r.status}`);
  }
  return r;
}

describe('WO-012 init', () => {
  it('AC-01: seeds canonical lifecycle vocabulary from initialState', () => {
    const manifests = {
      q_c: quest('q_c', { initialState: 'locked' }),
      q_b: quest('q_b', { initialState: 'available' }),
      q_a: quest('q_a', { initialState: 'active' }),
    };
    const r = committed(questInit(createQuestDomain(), manifests));
    expect(r.initializedQuestIds).toEqual(['q_a', 'q_b', 'q_c']);
    expect(r.state.quests['q_a']?.status).toBe('active');
    expect(r.state.quests['q_b']?.status).toBe('available');
    expect(r.state.quests['q_c']?.status).toBe('locked');
  });

  it('AC-01: inserts quests sorted by id regardless of manifest key order', () => {
    const manifests = { q_c: quest('q_c'), q_a: quest('q_a'), q_b: quest('q_b') };
    const r = committed(questInit(createQuestDomain(), manifests));
    expect(Object.keys(r.state.quests)).toEqual(['q_a', 'q_b', 'q_c']);
  });

  it('AC-01: is deterministic — equivalent manifests yield identical serialized state', () => {
    const first = committed(
      questInit(createQuestDomain(), { q_a: quest('q_a'), q_b: quest('q_b') })
    );
    const second = committed(
      questInit(createQuestDomain(), { q_b: quest('q_b'), q_a: quest('q_a') })
    );
    expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
  });

  it('AC-01: repeated init is an idempotent no-op returning the same state reference', () => {
    const manifests = { q_a: quest('q_a') };
    const domain = createQuestDomain();
    const first = committed(questInit(domain, manifests));
    const second = questInit(first.state, manifests);
    expect(second.status).toBe('unchanged');
    if (second.status !== 'unchanged') throw new Error('not unchanged');
    expect(second.state).toBe(first.state);
  });

  it('AC-01: re-init after progress does not reset the quest', () => {
    const manifest = quest('q_a');
    const domain = createQuestDomain();
    const init = committed(questInit(domain, { [manifest.id]: manifest }));
    const started = questStart(init.state, { [manifest.id]: manifest }, { questId: manifest.id });
    if (started.status !== 'committed') throw new Error('start failed');
    const again = questInit(started.state, { [manifest.id]: manifest });
    expect(again.status).toBe('unchanged');
    if (again.status !== 'unchanged') throw new Error('not unchanged');
    expect(again.state.quests[manifest.id]?.status).toBe('active');
  });

  it('AC-12 gate: an irrelevant existing set prevents partial hydration (atomicity)', () => {
    const good = quest('q_good');
    const bad = quest('q_bad', {
      objectives: [objective('obj_solo', 'analyze')],
    });
    const r = questInit(createQuestDomain(), { [good.id]: good, [bad.id]: bad });
    expect(r.status).toBe('error');
    if (r.status !== 'error') throw new Error('expected error');
    expect(r.error.code).toBe('impossible-required-objective');
    expect(Object.keys(r.state.quests)).toHaveLength(0);
  });
});
