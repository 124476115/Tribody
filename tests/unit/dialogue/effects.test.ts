/**
 * FS-DIALOGUE-001 — effect translation boundary (AC-03, AC-07).
 */
import { describe, it, expect } from 'vitest';
import { translateEffects, DialogueDomainError } from '../../../src/domain/dialogue';
import type { Effect } from '../../../src/domain/content';

describe('WO-011 effect translation', () => {
  it('translates every whitelisted effect kind into a request with a stable instanceId', () => {
    const effects: Effect[] = [
      { kind: 'set_flag', flag: 'flag.ch04.intro.completed' },
      { kind: 'adjust_relationship', npcId: 'npc_x', dimension: 'trust', amount: 1 },
      { kind: 'add_item', itemId: 'item_general_tape', count: 2 },
      { kind: 'remove_item', itemId: 'item_ch04_debug_log', count: 1 },
      { kind: 'add_codex', codexId: 'codex_science_falsifiability' },
      { kind: 'quest_event', event: 'ch04.raw_data_compare_requested' },
      { kind: 'award_xp', xp: 5 },
      { kind: 'play_audio', cueId: 'cue_voice_colleague_line1' },
      { kind: 'emit_narrative_event', event: 'npc.announced_countdown' },
    ];
    const requests = translateEffects(effects, 'dialog:dlg_x#1#2');
    expect(requests).toHaveLength(effects.length);
    requests.forEach((request, index) => {
      expect(request.instanceId).toBe(`dialog:dlg_x#1#2:${String(index)}`);
      expect(request.kind).toBe(effects[index]?.kind);
    });
  });

  it('canon-protected set_flag is refused (canon.* and era.transition.*)', () => {
    const canon = { kind: 'set_flag', flag: 'canon.ch04.anchor_reached' } as const;

    expect(() => translateEffects([{ ...canon }], 'dialog:dlg_a#1#1')).toThrowError(
      DialogueDomainError
    );
    expect(() => translateEffects([{ ...canon }], 'dialog:dlg_a#1#1')).toThrowError(/canon/);
    const era = { kind: 'set_flag', flag: 'era.transition.ch04.crisis_begins' } as const;
    expect(() => translateEffects([{ ...era }], 'dialog:dlg_a#1#2')).toThrowError(/canon/);
  });

  it('ordinary story flags pass through unharmed', () => {
    const effects: Effect[] = [{ kind: 'set_flag', flag: 'flag.ch04.intro.completed' }];
    expect(translateEffects(effects, 'dialog:dlg_a#1#1')[0]?.kind).toBe('set_flag');
  });
});
