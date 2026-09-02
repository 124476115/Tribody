/**
 * FS-DIALOGUE-001 — serialization / save-resume contract (AC-05, AC-09, AC-10).
 */
import { describe, it, expect } from 'vitest';
import {
  createDialogueDomain,
  dialogueStart,
  dialogueSelect,
  dialogueResolveSkillCheck,
  getPendingSkillCheck,
  getDialogueView,
  type DialogueSavedState,
} from '../../../src/domain/dialogue';
import { sampleDialogue, snapshot } from '../../helpers/dialogue-fixtures';
import { required } from '../../helpers/content-fixtures';

const MANIFEST = sampleDialogue();

function sessionSnapshot(state: DialogueSavedState): DialogueSavedState {
  return JSON.parse(JSON.stringify(state)) as DialogueSavedState;
}

function start(domain: DialogueSavedState, requestId = 'ReqA'): DialogueSavedState {
  const r = dialogueStart(domain, MANIFEST, { requestId, dialogueId: MANIFEST.id });
  if (r.status !== 'committed')
    throw new Error(`start failed: ${r.status === 'error' ? r.error.code : 'duplicate'}`);
  return r.state;
}

function select(
  domain: DialogueSavedState,
  choiceId: string,
  requestId = 'ReqB',
  overrides: { flags?: Record<string, boolean> } = {}
): DialogueSavedState {
  const r = dialogueSelect(
    domain,
    MANIFEST,
    { requestId, choiceId },
    snapshot({ flags: overrides.flags ?? {} })
  );
  if (r.status !== 'committed') throw new Error(`select "${choiceId}" failed`);
  return r.state;
}

describe('WO-011 dialogue serialization', () => {
  it('AC-05: save/resume restores the identical active state and continues identically', () => {
    let domain = start(createDialogueDomain(), 'ReqStartA');
    domain = select(domain, 'c_b', 'ReqSelA');

    const saved = sessionSnapshot(domain);
    expect(saved.active?.nodeId).toBe('n03');
    expect(saved.active?.history).toEqual(domain.active?.history);
    expect(saved.processedRequestIds).toEqual(domain.processedRequestIds);

    const view = getDialogueView(required(saved.active, 'active'), MANIFEST, snapshot());
    expect(view.choices.map((c) => c.id)).toEqual(['c_skill', 'c_leave']);
    const next = dialogueSelect(
      saved,
      MANIFEST,
      { requestId: 'ReqC', choiceId: 'c_leave' },
      snapshot()
    );
    expect(next.status).toBe('committed');
    if (next.status !== 'committed') throw new Error('x');
    expect(next.state.active?.mode).toBe('ended');
  });

  it('AC-05: the request ledger survives the round-trip and replays after resume are noops', () => {
    let domain = start(createDialogueDomain(), 'ReqStartA');
    domain = select(domain, 'c_b', 'ReqSelA');
    const resumed = sessionSnapshot(domain);

    const replay = dialogueSelect(
      resumed,
      MANIFEST,
      { requestId: 'ReqSelA', choiceId: 'c_b' },
      snapshot()
    );
    expect(replay.status).toBe('duplicate');
  });

  it('AC-09: a pending skill check survives the JSON round-trip', () => {
    let domain = start(createDialogueDomain(), 'ReqStartA');
    domain = select(domain, 'c_b', 'ReqSelA');
    domain = select(domain, 'c_skill', 'ReqSelB');
    expect(required(domain.active, 'active').mode).toBe('awaitingSkillCheck');

    const resumed = sessionSnapshot(domain);
    expect(resumed.active?.mode).toBe('awaitingSkillCheck');
    const pending = getPendingSkillCheck(required(resumed.active, 'active'), MANIFEST);
    expect(pending?.choiceId).toBe('c_skill');
    expect(pending?.skillId).toBe('skill_scientist_experimental_design');

    const resolution = dialogueResolveSkillCheck(resumed, MANIFEST, {
      requestId: 'ReqRes',
      choiceId: 'c_skill',
      outcome: 'passed',
    });
    expect(resolution.status).toBe('committed');
    if (resolution.status !== 'committed') throw new Error('x');
    expect(resolution.state.active?.mode).toBe('onNode');
    expect(resolution.state.active?.nodeId).toBe('n04');
  });

  it('AC-10: identical intent sequences over independent sessions serialize identically', () => {
    const run = (): string => {
      let domain = start(createDialogueDomain(), 'ReqStartA');
      domain = select(domain, 'c_b', 'ReqSelA');
      domain = select(domain, 'c_skill', 'ReqSelB');
      const r = dialogueResolveSkillCheck(domain, MANIFEST, {
        requestId: 'ReqRes',
        choiceId: 'c_skill',
        outcome: 'passed',
      });
      if (r.status !== 'committed') throw new Error('x');
      return JSON.stringify(r.state);
    };
    expect(run()).toBe(run());
    expect(JSON.stringify(sessionSnapshot(JSON.parse(run()) as DialogueSavedState))).toBe(run());
  });
});
