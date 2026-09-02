/**
 * FS-DIALOGUE-001 — runtime state machine (AC-01..04, AC-06..09, AC-11).
 */
import { describe, it, expect } from 'vitest';
import {
  createDialogueDomain,
  dialogueStart,
  dialogueSelect,
  dialogueAdvance,
  dialogueResolveSkillCheck,
  dialogueEnd,
  getDialogueView,
  getPendingSkillCheck,
  type DialogueResult,
  type DialogueSavedState,
} from '../../../src/domain/dialogue';
import {
  sampleDialogue,
  autoNextDialogue,
  snapshot,
  node,
  dialogue,
} from '../../helpers/dialogue-fixtures';
import { required } from '../../helpers/content-fixtures';
import { isValidEventId } from '../../../src/domain/events';

const MANIFEST = sampleDialogue();

function committed(r: DialogueResult): {
  state: DialogueSavedState;
  transition: NonNullable<Extract<DialogueResult, { status: 'committed' }>['transition']>;
} {
  if (r.status !== 'committed') throw new Error(`expected committed, got ${r.status}`);
  return { state: r.state, transition: r.transition };
}

function errorResult(r: DialogueResult): Extract<DialogueResult, { status: 'error' }>['error'] {
  if (r.status !== 'error') throw new Error(`expected error, got ${r.status}`);
  return r.error;
}

function dupState(r: DialogueResult): DialogueSavedState {
  if (r.status !== 'duplicate') throw new Error(`expected duplicate, got ${r.status}`);
  return r.state;
}

function viewOf(state: DialogueSavedState, manifest = MANIFEST) {
  return getDialogueView(required(state.active, 'active session'), manifest, snapshot());
}

describe('WO-011 dialogue runtime', () => {
  it('AC-01: start lands on the entry node and exposes the entry text', () => {
    const r = dialogueStart(createDialogueDomain(), MANIFEST, {
      requestId: 'req-start',
      dialogueId: MANIFEST.id,
    });
    const { state, transition } = committed(r);
    expect(transition.kind).toBe('started');
    expect(transition.targetNodeId).toBe('n01');
    expect(isValidEventId(transition.transitionId)).toBe(true);
    expect(state.active?.mode).toBe('onNode');
    expect(state.active?.nodeId).toBe('n01');
    expect(viewOf(state).textKey).toBeTruthy();
    expect(viewOf(state).choices.map((c) => c.id)).toEqual(['c_a', 'c_b']);
    expect(state.active?.history).toHaveLength(1);
  });

  it('AC-03: selecting a choice emits whitelisted effect requests with stable instance ids', () => {
    let domain = createDialogueDomain();
    const t1 = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'req-start', dialogueId: MANIFEST.id })
    );
    domain = t1.state;
    const t2 = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'req-sel', choiceId: 'c_b' }, snapshot())
    );
    domain = t2.state;
    expect(t2.transition.kind).toBe('choice_selected');
    expect(t2.transition.sourceNodeId).toBe('n01');
    expect(t2.transition.targetNodeId).toBe('n03');
    expect(t2.transition.effects.map((e) => e.kind)).toEqual(['adjust_relationship']);
    for (const effect of t2.transition.effects) {
      expect(effect.instanceId).toBe(`${t2.transition.transitionId}:0`);
      expect(isValidEventId(effect.instanceId)).toBe(true);
    }
    expect(domain.active?.nodeId).toBe('n03');
  });

  it('AC-03: target node onEnterEffects are emitted once when the node is entered', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    domain = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r1', choiceId: 'c_b' }, snapshot())
    ).state;
    const parked = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r2', choiceId: 'c_skill' }, snapshot())
    );
    domain = parked.state;
    expect(parked.transition.kind).toBe('skill_check_requested');
    const resolved = committed(
      dialogueResolveSkillCheck(domain, MANIFEST, {
        requestId: 'r3',
        choiceId: 'c_skill',
        outcome: 'passed',
      })
    );
    expect(resolved.transition.effects.map((e) => e.kind)).toEqual(['add_codex']);
    expect(resolved.state.active?.nodeId).toBe('n04');
    const ended = committed(
      dialogueSelect(resolved.state, MANIFEST, { requestId: 'r4', choiceId: 'c_end' }, snapshot())
    );
    expect(ended.state.active?.mode).toBe('ended');
  });

  it('AC-02: conditional choices reflect the snapshot; disabled choices cannot be selected', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    const hidden = viewOf(domain);
    expect(
      required(
        hidden.choices.find((c) => c.id === 'c_a'),
        'c_a'
      ).enabled
    ).toBe(false);
    const stale = dialogueSelect(
      domain,
      MANIFEST,
      { requestId: 'rX', choiceId: 'c_a' },
      snapshot()
    );
    expect(errorResult(stale).code).toBe('invalid-transition');
    expect(
      getDialogueView(
        required(domain.active, 'active'),
        MANIFEST,
        snapshot({ flags: { 'flag.ch04.data.a': true } })
      ).choices.find((c) => c.id === 'c_a')?.enabled
    ).toBe(true);
    const ok = committed(
      dialogueSelect(
        domain,
        MANIFEST,
        { requestId: 'rY', choiceId: 'c_a' },
        snapshot({ flags: { 'flag.ch04.data.a': true } })
      )
    );
    expect(ok.state.active?.nodeId).toBe('n02');
  });

  it('AC-04: duplicate SAME requestId produces no effects and does not advance state', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'req-start', dialogueId: MANIFEST.id })
    ).state;
    const first = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'req-sel', choiceId: 'c_b' }, snapshot())
    );
    domain = first.state;
    expect(domain.active?.nodeId).toBe('n03');

    const replay = dialogueSelect(
      domain,
      MANIFEST,
      { requestId: 'req-sel', choiceId: 'c_b' },
      snapshot()
    );
    expect(replay.status).toBe('duplicate');
    expect(replay.status).not.toBe('committed');
    expect(dupState(replay)).toBe(domain);
    expect(dupState(replay).active?.nodeId).toBe('n03');
  });

  it('AC-04: NEW requestId on the same choice after a legitimate dialogue loop commits normally', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    domain = committed(
      dialogueSelect(
        domain,
        MANIFEST,
        { requestId: 'r1', choiceId: 'c_a' },
        snapshot({ flags: { 'flag.ch04.data.a': true } })
      )
    ).state;
    expect(domain.active?.nodeId).toBe('n02');
    domain = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r2', choiceId: 'c_back' }, snapshot())
    ).state;
    expect(domain.active?.nodeId).toBe('n01');

    const again = committed(
      dialogueSelect(
        domain,
        MANIFEST,
        { requestId: 'r3', choiceId: 'c_a' },
        snapshot({ flags: { 'flag.ch04.data.a': true } })
      )
    );
    expect(again.transition.effects.map((e) => e.kind)).toEqual(['quest_event']);
    expect(again.state.active?.nodeId).toBe('n02');
    expect(again.transition.transitionId).toBe('dialog:dlg_sample_conversation#1#4');
  });

  it('AC-06: autoNext self-loop and missing target are rejected without changing state', () => {
    const selfLoop = dialogue('dlg_selfloop', 'n01', { n01: node('npc_x', { autoNext: 'n01' }) });
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, selfLoop, { requestId: 'r0', dialogueId: selfLoop.id })
    ).state;
    const r = dialogueAdvance(domain, selfLoop, { requestId: 'r1' });
    expect(errorResult(r).code).toBe('self-loop');
    expect(domain.active?.nextTransitionOrdinal).toBe(2);

    const missing = dialogue('dlg_missing', 'n01', { n01: node('npc_x', { autoNext: 'n99' }) });
    const started = committed(
      dialogueStart(createDialogueDomain(), missing, { requestId: 'r0', dialogueId: missing.id })
    );
    const m2 = dialogueAdvance(started.state, missing, { requestId: 'r1' });
    expect(errorResult(m2).code).toBe('malformed-content');
  });

  it('AC-08: advance on a node without autoNext is rejected', () => {
    const started = committed(
      dialogueStart(createDialogueDomain(), MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    );
    const r = dialogueAdvance(started.state, MANIFEST, { requestId: 'r1' });
    expect(errorResult(r).code).toBe('invalid-transition');
  });

  it('AC-08: select on idle/ended and start-while-active are rejected', () => {
    const onIdle = dialogueSelect(
      createDialogueDomain(),
      MANIFEST,
      { requestId: 'r0', choiceId: 'c_a' },
      snapshot()
    );
    expect(errorResult(onIdle).code).toBe('not-active');

    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    const second = dialogueStart(domain, MANIFEST, { requestId: 'r1', dialogueId: MANIFEST.id });
    expect(errorResult(second).code).toBe('already-active');

    domain = committed(dialogueEnd(domain, { requestId: 'r2' })).state;
    const onEnded = dialogueSelect(
      domain,
      MANIFEST,
      { requestId: 'r3', choiceId: 'c_a' },
      snapshot()
    );
    expect(errorResult(onEnded).code).toBe('not-active');
  });

  it('AC-08: starting the same dialogue after it ended creates a fresh occurrence', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    const firstInstance = required(domain.active, 'active').instanceOrdinal;
    domain = committed(dialogueEnd(domain, { requestId: 'r1' })).state;
    const restart = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r2', dialogueId: MANIFEST.id })
    );
    expect(restart.state.active?.instanceOrdinal).toBe(firstInstance + 1);
    expect(restart.state.active?.nodeId).toBe('n01');
  });

  it('AC-08: runtime error does not consume the requestId (same id may retry successfully)', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    const blocked = dialogueSelect(
      domain,
      MANIFEST,
      { requestId: 'retry-me', choiceId: 'c_a' },
      snapshot()
    );
    expect(errorResult(blocked).code).toBe('invalid-transition');
    const retried = dialogueSelect(
      domain,
      MANIFEST,
      { requestId: 'retry-me', choiceId: 'c_a' },
      snapshot({ flags: { 'flag.ch04.data.a': true } })
    );
    expect(committed(retried).state.active?.history).toHaveLength(2);
  });

  it('AC-08: runtime error does not consume the transition ordinal', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    const blocked = dialogueAdvance(domain, MANIFEST, { requestId: 'bad' });
    expect(errorResult(blocked).code).toBe('invalid-transition');
    const next = committed(
      dialogueSelect(
        domain,
        MANIFEST,
        { requestId: 'r1', choiceId: 'c_a' },
        snapshot({ flags: { 'flag.ch04.data.a': true } })
      )
    );
    expect(next.transition.transitionId).toBe('dialog:dlg_sample_conversation#1#2');
  });

  it('AC-09: skill-check choice parks in awaitingSkillCheck and exposes the pending request', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    domain = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r1', choiceId: 'c_b' }, snapshot())
    ).state;
    const parked = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r2', choiceId: 'c_skill' }, snapshot())
    );
    expect(parked.transition.kind).toBe('skill_check_requested');
    expect(parked.transition.effects).toHaveLength(0);
    expect(parked.transition.skillCheck).toEqual({
      dialogueId: MANIFEST.id,
      instanceOrdinal: parked.state.active?.instanceOrdinal,
      nodeId: 'n03',
      choiceId: 'c_skill',
      skillId: 'skill_scientist_experimental_design',
      threshold: 1,
    });
    expect(parked.state.active?.mode).toBe('awaitingSkillCheck');
    expect(viewOf(parked.state).choices.find((c) => c.id === 'c_skill')?.enabled).toBe(true);
  });

  it('AC-09: explicit resolution is required — state stays pending until one arrives', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    domain = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r1', choiceId: 'c_b' }, snapshot())
    ).state;
    domain = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r2', choiceId: 'c_skill' }, snapshot())
    ).state;

    const pending = getPendingSkillCheck(required(domain.active, 'active'), MANIFEST);
    expect(pending).toEqual({
      dialogueId: MANIFEST.id,
      instanceOrdinal: domain.active?.instanceOrdinal,
      nodeId: 'n03',
      choiceId: 'c_skill',
      skillId: 'skill_scientist_experimental_design',
      threshold: 1,
    });
    expect(domain.active?.mode).toBe('awaitingSkillCheck');
    expect(domain.active?.nextTransitionOrdinal).toBe(4);
  });

  it('AC-09: resolve requires an explicit outcome; mismatched resolution is rejected', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    const noPending = dialogueResolveSkillCheck(domain, MANIFEST, {
      requestId: 'r1',
      choiceId: 'c_skill',
      outcome: 'passed',
    });
    expect(errorResult(noPending).code).toBe('not-active');

    domain = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r1', choiceId: 'c_b' }, snapshot())
    ).state;
    domain = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r2', choiceId: 'c_skill' }, snapshot())
    ).state;
    const wrong = dialogueResolveSkillCheck(domain, MANIFEST, {
      requestId: 'r3',
      choiceId: 'c_leave',
      outcome: 'passed',
    });
    expect(errorResult(wrong).code).toBe('invalid-transition');
  });

  it('AC-09: passed applies choice effects; failed applies none of the choice effects (never on failure)', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    domain = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r1', choiceId: 'c_b' }, snapshot())
    ).state;
    domain = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r2', choiceId: 'c_skill' }, snapshot())
    ).state;
    const failedR = committed(
      dialogueResolveSkillCheck(domain, MANIFEST, {
        requestId: 'r3',
        choiceId: 'c_skill',
        outcome: 'failed',
      })
    );
    expect(failedR.transition.outcome).toBe('failed');
    // Failure applies NONE of the choice effects, but the target node's
    // onEnter effects (add_codex on n04) still apply — advance without the
    // choice payoff, per the minimal failure policy.
    expect(failedR.transition.effects.map((e) => e.kind)).toEqual(['add_codex']);
    expect(failedR.state.active?.nodeId).toBe('n04');
    expect(failedR.state.active?.mode).toBe('onNode');

    let domain2 = createDialogueDomain();
    domain2 = committed(
      dialogueStart(domain2, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    domain2 = committed(
      dialogueSelect(domain2, MANIFEST, { requestId: 'r1', choiceId: 'c_b' }, snapshot())
    ).state;
    domain2 = committed(
      dialogueSelect(domain2, MANIFEST, { requestId: 'r2', choiceId: 'c_skill' }, snapshot())
    ).state;
    const passedR = committed(
      dialogueResolveSkillCheck(domain2, MANIFEST, {
        requestId: 'r3',
        choiceId: 'c_skill',
        outcome: 'passed',
      })
    );
    expect(passedR.transition.outcome).toBe('passed');
    expect(passedR.transition.effects.map((e) => e.kind)).toEqual(['add_codex']);
    expect(passedR.state.active?.history.at(-1)?.outcome).toBe('passed');
  });

  it('AC-11: next:"end" reaches ended and further intents are rejected', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    domain = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r1', choiceId: 'c_b' }, snapshot())
    ).state;
    const end = committed(
      dialogueSelect(domain, MANIFEST, { requestId: 'r2', choiceId: 'c_leave' }, snapshot())
    );
    expect(end.transition.kind).toBe('choice_selected');
    expect(end.state.active?.mode).toBe('ended');
    const afterEnd = dialogueSelect(
      end.state,
      MANIFEST,
      { requestId: 'r3', choiceId: 'c_b' },
      snapshot()
    );
    expect(errorResult(afterEnd).code).toBe('not-active');
  });

  it('AC-11: explicit end request closes the dialogue', () => {
    let domain = createDialogueDomain();
    domain = committed(
      dialogueStart(domain, MANIFEST, { requestId: 'r0', dialogueId: MANIFEST.id })
    ).state;
    const r = committed(dialogueEnd(domain, { requestId: 'r1' }));
    expect(r.state.active?.mode).toBe('ended');
    expect(r.state.active?.nodeId).toBeNull();
    const again = dialogueEnd(r.state, { requestId: 'r2' });
    expect(errorResult(again).code).toBe('not-active');
  });

  it('AC-06: autoNext advances exactly one node per step and terminates on "end"', () => {
    const m = autoNextDialogue();
    let domain = createDialogueDomain();
    domain = committed(dialogueStart(domain, m, { requestId: 'r0', dialogueId: m.id })).state;
    domain = committed(dialogueAdvance(domain, m, { requestId: 'r1' })).state;
    expect(domain.active?.nodeId).toBe('n02');
    domain = committed(dialogueAdvance(domain, m, { requestId: 'r2' })).state;
    expect(domain.active?.nodeId).toBe('n03');
    const end = committed(dialogueAdvance(domain, m, { requestId: 'r3' }));
    expect(end.transition.kind).toBe('ended');
    expect(end.state.active?.mode).toBe('ended');
  });

  it('AC-07: canon-protected set_flag is refused by the runtime even on raw content', () => {
    const canon = dialogue('dlg_canon', 'n01', {
      n01: node('npc_x', {
        choices: [
          {
            id: 'c_bad',
            textKey: 'dlg.test.c_bad',
            conditions: [],
            effects: [{ kind: 'set_flag', flag: 'canon.ch04.change' }],
            next: 'end',
          },
        ],
      }),
    });
    const started = committed(
      dialogueStart(createDialogueDomain(), canon, { requestId: 'r0', dialogueId: canon.id })
    );
    const r = dialogueSelect(
      started.state,
      canon,
      { requestId: 'r1', choiceId: 'c_bad' },
      snapshot()
    );
    const err = errorResult(r);
    expect(err.code).toBe('canon-protected-effect');
    expect(started.state.active?.nextTransitionOrdinal).toBe(2);
  });
});
