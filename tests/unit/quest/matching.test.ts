/**
 * FS-QUEST-001 — AC-03 matching win/guess/overlap (matchObjective): semantic
 * `listensFor` is matched by event.type only (never event.id); structured
 * kinds use their canonical type + scoped payload; kinds without a default
 * contract never match on their own.
 */
import { describe, it, expect } from 'vitest';
import { matchObjective } from '../../../src/domain/quest';
import { objective, domainEvent } from '../../helpers/quest-fixtures';

describe('WO-012 matching', () => {
  it('AC-03: semantic listensFor matches event.type, not event.id', () => {
    const obj = objective('o1', 'analyze', { listensFor: ['ch04.raw_data_compare_requested'] });
    expect(matchObjective(obj, domainEvent('evt-1', 'ch04.raw_data_compare_requested'))).toBe(true);
    expect(matchObjective(obj, domainEvent('evt-999', 'ch04.raw_data_compare_requested'))).toBe(
      true
    );
    expect(matchObjective(obj, domainEvent('evt-1', 'ch04.other_signal'))).toBe(false);
  });

  it('AC-03: structured collect_evidence requires a listed evidenceId', () => {
    const obj = objective('o_cam', 'collect_evidence', {
      evidenceIds: ['ev_camera_original', 'ev_camera_control'],
    });
    expect(
      matchObjective(
        obj,
        domainEvent('e1', 'evidence.collected', { evidenceId: 'ev_camera_original' })
      )
    ).toBe(true);
    expect(
      matchObjective(obj, domainEvent('e2', 'evidence.collected', { evidenceId: 'ev_unrelated' }))
    ).toBe(false);
    expect(matchObjective(obj, domainEvent('e3', 'evidence.collected', {}))).toBe(false);
    expect(
      matchObjective(obj, domainEvent('e4', 'item.acquired', { evidenceId: 'ev_camera_original' }))
    ).toBe(false);
  });

  it('AC-03: structured talk/go_to/interact/choose default contracts', () => {
    const talk = objective('o_t', 'talk', { npcId: 'npc_a' });
    expect(matchObjective(talk, domainEvent('e1', 'npc.talked', { npcId: 'npc_a' }))).toBe(true);
    expect(matchObjective(talk, domainEvent('e2', 'npc.talked', { npcId: 'npc_b' }))).toBe(false);

    const goTo = objective('o_g', 'go_to', { sceneId: 'sc_a' });
    expect(matchObjective(goTo, domainEvent('e3', 'scene.entered', { sceneId: 'sc_a' }))).toBe(
      true
    );
    expect(matchObjective(goTo, domainEvent('e4', 'scene.entered', { sceneId: 'sc_b' }))).toBe(
      false
    );

    const interact = objective('o_i', 'interact', { sceneId: 'sc_a' });
    expect(
      matchObjective(interact, domainEvent('e5', 'world.interaction', { sceneId: 'sc_a' }))
    ).toBe(true);
    expect(
      matchObjective(interact, domainEvent('e6', 'world.interaction', { sceneId: 'sc_b' }))
    ).toBe(false);

    const choose = objective('o_c', 'choose', { dialogueId: 'dlg_x' });
    expect(
      matchObjective(choose, domainEvent('e7', 'dialogue.choice_selected', { dialogueId: 'dlg_x' }))
    ).toBe(true);
    expect(
      matchObjective(choose, domainEvent('e8', 'dialogue.choice_selected', { dialogueId: 'dlg_y' }))
    ).toBe(false);
  });

  it('AC-03: kinds without a default contract never match without listensFor', () => {
    for (const type of ['analyze', 'wait_for_event', 'repair', 'escort', 'survive'] as const) {
      const obj = objective(`o_${type}`, type);
      expect(
        matchObjective(obj, domainEvent('e1', 'evidence.collected', { evidenceId: 'ev_a' }))
      ).toBe(false);
      expect(matchObjective(obj, domainEvent('e2', 'ch04.raw_data_compare_requested'))).toBe(false);
    }
  });

  it('AC-03: a listensFor value overrides the structured default contract', () => {
    const obj = objective('o_mix', 'collect_evidence', {
      evidenceIds: ['ev_a'],
      listensFor: ['ch04.compare_requested'],
    });
    expect(matchObjective(obj, domainEvent('e1', 'ch04.compare_requested'))).toBe(true);
    expect(
      matchObjective(obj, domainEvent('e2', 'evidence.collected', { evidenceId: 'ev_a' }))
    ).toBe(false);
  });

  it('AC-03: non-object payloads never match structured contracts', () => {
    const obj = objective('o_t', 'talk', { npcId: 'npc_a' });
    expect(matchObjective(obj, domainEvent('e1', 'npc.talked'))).toBe(false);
    expect(matchObjective(obj, domainEvent('e2', 'npc.talked', { npcId: 'npc_a', extra: 1 }))).toBe(
      true
    );
  });
});
