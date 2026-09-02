/**
 * FS-DIALOGUE-001 — condition evaluation boundary (AC-02).
 */
import { describe, it, expect } from 'vitest';
import { evaluateCondition, evaluateConditions } from '../../../src/domain/dialogue';
import type { Condition } from '../../../src/domain/content';
import { snapshot } from '../../helpers/dialogue-fixtures';

describe('WO-011 condition evaluation', () => {
  it('flag: satisfied only when present and true', () => {
    const c: Condition = { kind: 'flag', flag: 'flag.ch04.data.a' };
    expect(evaluateCondition(c, snapshot())).toBe(false);
    expect(evaluateCondition(c, snapshot({ flags: { 'flag.ch04.data.a': true } }))).toBe(true);
  });

  it('quest_state: exact match on state', () => {
    const c: Condition = { kind: 'quest_state', questId: 'q_ch04_x', state: 'active' };
    expect(evaluateCondition(c, snapshot({ questStates: { q_ch04_x: 'available' } }))).toBe(false);
    expect(evaluateCondition(c, snapshot({ questStates: { q_ch04_x: 'active' } }))).toBe(true);
  });

  it('relationship_at_least: dimension score threshold', () => {
    const c: Condition = {
      kind: 'relationship_at_least',
      npcId: 'npc_y',
      dimension: 'trust',
      min: 3,
    };
    expect(evaluateCondition(c, snapshot({ relationships: { npc_y: { trust: 2 } } }))).toBe(false);
    expect(evaluateCondition(c, snapshot({ relationships: { npc_y: { trust: 3 } } }))).toBe(true);
    expect(evaluateCondition(c, snapshot({ relationships: {} }))).toBe(false);
  });

  it('skill_at_least: value threshold', () => {
    const c: Condition = {
      kind: 'skill_at_least',
      skillId: 'skill_scientist_experimental_design',
      value: 1,
    };
    expect(evaluateCondition(c, snapshot())).toBe(false);
    expect(
      evaluateCondition(c, snapshot({ skillValues: { skill_scientist_experimental_design: 1 } }))
    ).toBe(true);
  });

  it('has_item: count defaults to 1', () => {
    const one: Condition = { kind: 'has_item', itemId: 'item_general_tape' };
    const many: Condition = { kind: 'has_item', itemId: 'item_ch04_debug_log', count: 3 };
    expect(evaluateCondition(one, snapshot({ itemCounts: { item_general_tape: 0 } }))).toBe(false);
    expect(evaluateCondition(one, snapshot({ itemCounts: { item_general_tape: 1 } }))).toBe(true);
    expect(evaluateCondition(many, snapshot({ itemCounts: { item_ch04_debug_log: 3 } }))).toBe(
      true
    );
  });

  it('has_codex: unlocked flag', () => {
    const c: Condition = { kind: 'has_codex', codexId: 'codex_science_falsifiability' };
    expect(
      evaluateCondition(c, snapshot({ codexUnlocked: { codex_science_falsifiability: false } }))
    ).toBe(false);
    expect(
      evaluateCondition(c, snapshot({ codexUnlocked: { codex_science_falsifiability: true } }))
    ).toBe(true);
  });

  it('chapter_state: satisfied iff active chapter matches', () => {
    const c: Condition = { kind: 'chapter_state', chapterId: 'ch_common_04_countdown' };
    expect(evaluateCondition(c, snapshot())).toBe(true);
    expect(evaluateCondition(c, snapshot({ activeChapterId: 'ch_common_03_bunker' }))).toBe(false);
  });

  it('evaluateConditions: conjunction', () => {
    const list: Condition[] = [
      { kind: 'flag', flag: 'flag.ch04.data.a' },
      { kind: 'has_item', itemId: 'item_general_tape' },
    ];
    expect(evaluateConditions(list, snapshot())).toBe(false);
    expect(
      evaluateConditions(
        list,
        snapshot({ flags: { 'flag.ch04.data.a': true }, itemCounts: { item_general_tape: 1 } })
      )
    ).toBe(true);
  });

  it('unknown condition kind never silently evaluates', () => {
    const bogus = { kind: 'lunar_phase', phase: 'waxing' } as unknown as Condition;
    expect(() => evaluateCondition(bogus, snapshot())).toThrowError(/unknown condition kind/);
  });
});
