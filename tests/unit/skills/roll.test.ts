/**
 * FS-SKILL-001 AC-07 / AC-08 — RollV1 determinism, range contract, and the
 * frozen golden vectors (Rev 3). The golden vectors pin the FNV-1a anchor, the
 * `seed + '#' + attempt` expansion, rejection sampling, and the retry path.
 */
import { describe, it, expect } from 'vitest';
import {
  fnv1a32,
  rollV1,
  skillCheckRollSeed,
  type SkillCheckSeed,
} from '../../../src/domain/skills';

const DEV_CHECK_SEED: SkillCheckSeed = {
  dialogueId: 'dlg_sample_conversation',
  instanceOrdinal: 1,
  nodeId: 'n03',
  choiceId: 'c_skill',
  skillId: 'skill_scientist_experimental_design',
};

describe('FS-SKILL-001 RollV1', () => {
  it('AC-08: published FNV-1a anchors hold', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
  });

  it('AC-05/AC-07: normal die (20) golden vectors and range contract', () => {
    expect(
      rollV1('dlg_sample_conversation#1#n03#c_skill#skill_scientist_experimental_design', 20)
    ).toEqual({
      roll: 3,
      attempts: 0,
    });
    expect(
      rollV1('dlg_sample_conversation#2#n03#c_skill#skill_scientist_experimental_design', 20)
    ).toEqual({
      roll: 10,
      attempts: 0,
    });
    expect(rollV1('dlg_ch04_signal#1#n05#c_scan#skill_scientist_signal_analysis', 20)).toEqual({
      roll: 11,
      attempts: 0,
    });
    expect(rollV1('dlg_ch04_crew#1#n02#c_comfort#skill_humanist_empathy', 20)).toEqual({
      roll: 18,
      attempts: 0,
    });
  });

  it('AC-08: crafted-large-die golden vectors exercise the rejection/retry path', () => {
    // die 0x90000000 => limit 0x90000000, tail 0x70000000 (~44% rejection);
    // one seed rejects attempts 0..19 then accepts 20, the other 0..9 then 10.
    expect(rollV1('chase_seed_019', 0x90000000)).toEqual({ roll: 2191426141, attempts: 20 });
    expect(
      rollV1('dlg_sc_test#1#n01#c_skill#skill_strategist_risk_analysis_diebig', 0x90000000)
    ).toEqual({ roll: 2027315711, attempts: 10 });
  });

  it('AC-07: roll is deterministic — same seed + die always produce the same value', () => {
    const a = rollV1('identity-x#1#n1#c1#skill_a', 20);
    const b = rollV1('identity-x#1#n1#c1#skill_a', 20);
    expect(a).toEqual(b);
  });

  it('AC-07: rolls for distinct seeds are independent', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i += 1) {
      seen.add(rollV1(`probe#${String(i)}#n1#c1#skill_b`, 0x1000000).roll);
    }
    expect(seen.size).toBe(40);
  });

  it('AC-07: the check roll seed is the frozen identity contract', () => {
    expect(skillCheckRollSeed(DEV_CHECK_SEED)).toBe(
      'dlg_sample_conversation#1#n03#c_skill#skill_scientist_experimental_design'
    );
  });
});
