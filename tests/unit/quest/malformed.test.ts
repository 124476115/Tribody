/**
 * FS-QUEST-001 — AC-12 soft-lock safety: questInit rejects any manifest whose
 * REQUIRED objective has no reachable match rule. Rejection is atomic (nothing
 * is hydrated). Optional objectives are exempt.
 */
import { describe, it, expect } from 'vitest';
import { createQuestDomain, questInit, type QuestInitResult } from '../../../src/domain/quest';
import type { QuestManifest } from '../../../src/domain/content';
import { objective, quest } from '../../helpers/quest-fixtures';

function rejected(pairs: Record<string, QuestManifest>): QuestInitResult & { status: 'error' } {
  const r = questInit(createQuestDomain(), pairs);
  if (r.status !== 'error') {
    throw new Error('expected init error, got ' + r.status);
  }
  expect(r.error.code).toBe('impossible-required-objective');
  return r;
}

describe('WO-012 listenability gate', () => {
  it('AC-12: required analyze/wait_for_event/repair/escort/survive need listensFor', () => {
    for (const type of ['analyze', 'wait_for_event', 'repair', 'escort', 'survive'] as const) {
      const m = quest(`q_${type}`, {
        objectives: [objective(`obj_${type}`, type)],
      });
      const r = questInit(createQuestDomain(), { [m.id]: m });
      expect(r.status).toBe('error');
      if (r.status !== 'error') throw new Error('expected error');
      expect(r.error.code).toBe('impossible-required-objective');
    }
  });

  it('AC-12: required structured kinds need their mandatory scope field', () => {
    const cases: [ReturnType<typeof quest>, string][] = [
      [quest('q_talk', { objectives: [objective('o_t', 'talk')] }), 'talk'],
      [quest('q_go', { objectives: [objective('o_g', 'go_to')] }), 'go_to'],
      [quest('q_int', { objectives: [objective('o_i', 'interact')] }), 'interact'],
      [quest('q_choose', { objectives: [objective('o_c', 'choose')] }), 'choose'],
    ];
    for (const [m, label] of cases) {
      const r = questInit(createQuestDomain(), { [m.id]: m });
      expect(r.status, `${label} must fail init`).toBe('error');
      if (r.status !== 'error') throw new Error('expected error');
      expect(r.error.code).toBe('impossible-required-objective');
    }
  });

  it('AC-12: required collect_evidence needs at least one evidenceId', () => {
    const m = quest('q_ev_empty', {
      objectives: [objective('o_e', 'collect_evidence', { evidenceIds: [] })],
    });
    const r = questInit(createQuestDomain(), { [m.id]: m });
    expect(r.status).toBe('error');
    if (r.status !== 'error') throw new Error('expected error');
    expect(r.error.code).toBe('impossible-required-objective');
  });

  it('AC-12: a required objective with a valid contract passes init', () => {
    const m = quest('q_ok', {
      objectives: [objective('o_t', 'talk', { npcId: 'npc_a' })],
    });
    const r = questInit(createQuestDomain(), { [m.id]: m });
    expect(r.status).toBe('committed');
  });

  it('AC-12: optional impossible objectives are exempt', () => {
    const m = quest('q_opt_free', {
      objectives: [
        objective('o_req', 'talk', { npcId: 'npc_a' }),
        objective('o_opt', 'analyze', { required: false }),
      ],
    });
    const r = questInit(createQuestDomain(), { [m.id]: m });
    expect(r.status).toBe('committed');
  });

  it('AC-12: rejection is atomic — no quest is hydrated when one is invalid', () => {
    const good = quest('q_good');
    const bad = quest('q_bad', { objectives: [objective('o_solo', 'analyze')] });
    rejected({ q_alpha: quest('q_alpha'), [good.id]: good, [bad.id]: bad });
  });

  it('AC-12: error result carries the unchanged starter state', () => {
    const m = quest('q_bad', { objectives: [objective('o_solo', 'analyze')] });
    const r = rejected({ [m.id]: m });
    expect(r.state).toEqual({ quests: {} });
  });
});
