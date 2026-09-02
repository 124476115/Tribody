/**
 * FS-QUEST-001 — AC-02 questStart and AC-08 questArchive lifecycle transitions
 * and their error paths. Errors leave state untouched (no transition emitted).
 */
import { describe, it, expect } from 'vitest';
import {
  createQuestDomain,
  questApplyEvent,
  questArchive,
  questInit,
  questStart,
  type QuestApplyResult,
  type QuestSavedState,
  type QuestStepResult,
} from '../../../src/domain/quest';
import type { QuestManifest } from '../../../src/domain/content';
import { domainEvent, quest, semanticQuest } from '../../helpers/quest-fixtures';
import { required } from '../../helpers/content-fixtures';

function step(r: QuestStepResult): QuestSavedState {
  if (r.status !== 'committed') {
    throw new Error(`expected committed step, got ${r.status}`);
  }
  return r.state;
}

function apply(r: QuestApplyResult): QuestSavedState {
  if (r.status !== 'committed') {
    throw new Error('expected committed apply, got ' + r.status);
  }
  return r.state;
}

function errorCode(r: QuestStepResult): string {
  if (r.status !== 'error') throw new Error('expected error result');
  return r.error.code;
}

function setup(pairs: Record<string, QuestManifest>): {
  domain: QuestSavedState;
  manifests: Record<string, QuestManifest>;
} {
  const init = questInit(createQuestDomain(), pairs);
  if (init.status !== 'committed') throw new Error('init failed');
  return { domain: init.state, manifests: pairs };
}

describe('WO-012 lifecycle', () => {
  it('AC-02: available → active emits quest_started at ordinal 1', () => {
    const m = quest('q_a');
    const { domain, manifests } = setup({ [m.id]: m });
    const r = questStart(domain, manifests, { questId: m.id });
    if (r.status !== 'committed') throw new Error('start failed');
    const t = required(r.transitions[0], 'transition');
    expect(t.kind).toBe('quest_started');
    expect(t.questId).toBe(m.id);
    expect(t.seq).toBe(1);
    expect(t.transitionId).toBe('quest:q_a#1');
    expect(t.objectiveIds).toEqual([]);
    expect(r.state.quests[m.id]?.status).toBe('active');
    expect(r.state.quests[m.id]?.nextTransitionOrdinal).toBe(2);
    expect(r.state.quests[m.id]?.history).toHaveLength(1);
  });

  it('AC-02: locked quest refuses to start (quest-locked)', () => {
    const m = quest('q_locked', { initialState: 'locked' });
    const { domain, manifests } = setup({ [m.id]: m });
    expect(errorCode(questStart(domain, manifests, { questId: m.id }))).toBe('quest-locked');
  });

  it('AC-02: active quest refuses a second start (already-active)', () => {
    const m = quest('q_a');
    const { domain, manifests } = setup({ [m.id]: m });
    const active = step(questStart(domain, manifests, { questId: m.id }));
    expect(errorCode(questStart(active, manifests, { questId: m.id }))).toBe('already-active');
  });

  it('AC-02/07: resolved and archived quests refuse to start (quest-terminal)', () => {
    const m = semanticQuest('q_res', 'ch04.raw_data_compare_requested');
    const { domain, manifests } = setup({ [m.id]: m });
    const started = questStart(domain, manifests, { questId: m.id });
    const active = step(started);
    const resolved = apply(
      questApplyEvent(active, manifests, domainEvent('evt-r', 'ch04.raw_data_compare_requested'))
    );

    expect(errorCode(questStart(resolved, manifests, { questId: m.id }))).toBe('quest-terminal');

    const archived = step(questArchive(resolved, manifests, { questId: m.id }));
    expect(errorCode(questStart(archived, manifests, { questId: m.id }))).toBe('quest-terminal');
  });

  it('AC-02: unknown quest id is unknown-quest', () => {
    const { domain } = setup({ q_a: quest('q_a') });
    expect(errorCode(questStart(domain, {}, { questId: 'q_missing' }))).toBe('unknown-quest');
  });

  it('AC-08: resolved_* → archived emits quest_archived exactly once', () => {
    const m = semanticQuest('q_res', 'ch04.raw_data_compare_requested');
    const { domain, manifests } = setup({ [m.id]: m });
    const active = step(questStart(domain, manifests, { questId: m.id }));
    const resolved = apply(
      questApplyEvent(active, manifests, domainEvent('evt-r', 'ch04.raw_data_compare_requested'))
    );
    if (resolved.quests[m.id]?.status !== 'resolved_success') throw new Error('not resolved');

    const r = questArchive(resolved, manifests, { questId: m.id });
    expect(r.status).toBe('committed');
    if (r.status !== 'committed') throw new Error('archive failed');
    expect(r.transitions[0]?.kind).toBe('quest_archived');
    expect(r.state.quests[m.id]?.status).toBe('archived');
  });

  it('AC-08: only resolved quests can be archived (invalid-transition otherwise)', () => {
    const active = quest('q_active');
    const available = quest('q_avail');
    const locked = quest('q_locked', { initialState: 'locked' });
    const { domain, manifests } = setup({
      [active.id]: active,
      [available.id]: available,
      [locked.id]: locked,
    });

    for (const qid of [active.id, available.id, locked.id]) {
      expect(errorCode(questArchive(domain, manifests, { questId: qid }))).toBe(
        'invalid-transition'
      );
    }
  });

  it('AC-08: already-archived quest cannot be archived again (invalid-transition)', () => {
    const m = semanticQuest('q_res', 'ch04.raw_data_compare_requested');
    const { domain, manifests } = setup({ [m.id]: m });
    const active = step(questStart(domain, manifests, { questId: m.id }));
    const resolved = apply(
      questApplyEvent(active, manifests, domainEvent('evt-r', 'ch04.raw_data_compare_requested'))
    );
    const archived = step(questArchive(resolved, manifests, { questId: m.id }));
    expect(errorCode(questArchive(archived, manifests, { questId: m.id }))).toBe(
      'invalid-transition'
    );
  });

  it('AC-08: archiving an unknown quest is unknown-quest', () => {
    const { domain } = setup({ q_a: quest('q_a') });
    expect(errorCode(questArchive(domain, {}, { questId: 'q_missing' }))).toBe('unknown-quest');
  });

  it('AC-02/08: error results never emit transitions or mutate state', () => {
    const m = quest('q_locked', { initialState: 'locked' });
    const { domain, manifests } = setup({ [m.id]: m });
    const before = JSON.stringify(domain);
    const r = questStart(domain, manifests, { questId: m.id });
    if (r.status !== 'error') throw new Error('expected error');
    expect(JSON.stringify(domain)).toBe(before);
  });
});
