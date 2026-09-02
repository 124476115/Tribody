/**
 * WO-011 — integration: a complete branching sample conversation (mirrors the
 * structure of `content_examples/dialogue_ch04_sample.yaml`: branch, loop,
 * conditional choice, skill check, codex/relationship emission). No production
 * prose is copied; the fixtures use abstract text keys.
 */
import { describe, it, expect } from 'vitest';
import {
  createDialogueDomain,
  dialogueStart,
  dialogueSelect,
  dialogueResolveSkillCheck,
  getDialogueView,
  type DialogueResult,
  type DialogueSavedState,
} from '../../src/domain/dialogue';
import { sampleDialogue, snapshot } from '../helpers/dialogue-fixtures';
import { required } from '../helpers/content-fixtures';

const MANIFEST = sampleDialogue();

class Runner {
  domain: DialogueSavedState = createDialogueDomain();
  emitted: string[] = [];

  step(r: DialogueResult): void {
    if (r.status !== 'committed') {
      throw new Error(
        `step failed with ${r.status}${r.status === 'error' ? `: ${r.error.message}` : ''}`
      );
    }
    this.domain = r.state;
    for (const effect of r.transition.effects)
      this.emitted.push(`${effect.kind}:${effect.instanceId}`);
  }

  view() {
    return getDialogueView(required(this.domain.active, 'active session'), MANIFEST, snapshot());
  }
}

describe('WO-011 integration — branching sample conversation', () => {
  it('a full conversation completes: conditional branch, loop, skill check, codex, end', () => {
    const run = new Runner();

    // Start (entry n01).
    run.step(
      dialogueStart(run.domain, MANIFEST, { requestId: 'r-start', dialogueId: MANIFEST.id })
    );

    // Without the flag, c_a is hidden; c_b is available.
    const entryView = run.view();
    expect(
      required(
        entryView.choices.find((c) => c.id === 'c_a'),
        'c_a'
      ).enabled
    ).toBe(false);

    // Pick c_b → relationship effect, moving to n03.
    run.step(
      dialogueSelect(run.domain, MANIFEST, { requestId: 'r-b', choiceId: 'c_b' }, snapshot())
    );
    expect(run.domain.active?.nodeId).toBe('n03');
    expect(run.emitted).toHaveLength(1);
    expect(run.emitted[0]?.startsWith('adjust_relationship:')).toBe(true);

    // c_leave ends the conversation on the c_b path.
    run.step(
      dialogueSelect(
        run.domain,
        MANIFEST,
        { requestId: 'r-leave', choiceId: 'c_leave' },
        snapshot()
      )
    );
    expect(run.domain.active?.mode).toBe('ended');

    const endedView = run.view();
    expect(endedView.mode).toBe('ended');
    expect(endedView.choices).toHaveLength(0);
  });

  it('the skill-check + codex branch emits add_codex exactly once on passed resolution', () => {
    const run = new Runner();
    const withFlag = snapshot({ flags: { 'flag.ch04.data.a': true } });

    run.step(
      dialogueStart(run.domain, MANIFEST, { requestId: 'r-start', dialogueId: MANIFEST.id })
    );
    run.step(dialogueSelect(run.domain, MANIFEST, { requestId: 'r-a', choiceId: 'c_a' }, withFlag));
    expect(run.domain.active?.nodeId).toBe('n02');
    run.step(
      dialogueSelect(run.domain, MANIFEST, { requestId: 'r-back', choiceId: 'c_back' }, snapshot())
    );
    expect(run.domain.active?.nodeId).toBe('n01');
    // Legitimate loop: same c_a again, new requestId → effects emitted again.
    run.step(
      dialogueSelect(run.domain, MANIFEST, { requestId: 'r-a2', choiceId: 'c_a' }, withFlag)
    );
    expect(run.emitted.filter((e) => e.startsWith('quest_event:'))).toHaveLength(2);

    // Now take the c_b → c_skill path (loop back to n01 first) and resolve passed.
    run.step(
      dialogueSelect(run.domain, MANIFEST, { requestId: 'r-back2', choiceId: 'c_back' }, snapshot())
    );
    expect(run.domain.active?.nodeId).toBe('n01');
    run.step(
      dialogueSelect(run.domain, MANIFEST, { requestId: 'r-b', choiceId: 'c_b' }, snapshot())
    );
    run.step(
      dialogueSelect(
        run.domain,
        MANIFEST,
        { requestId: 'r-skill', choiceId: 'c_skill' },
        snapshot()
      )
    );
    expect(run.domain.active?.mode).toBe('awaitingSkillCheck');
    // The parked commit emitted nothing.
    expect(run.emitted.filter((e) => e.startsWith('add_codex:'))).toHaveLength(0);
    run.step(
      dialogueResolveSkillCheck(run.domain, MANIFEST, {
        requestId: 'r-res',
        choiceId: 'c_skill',
        outcome: 'passed',
      })
    );
    expect(run.domain.active?.nodeId).toBe('n04');
    // add_codex emitted exactly once (on the passed resolution transition).
    expect(run.emitted.filter((e) => e.startsWith('add_codex:'))).toHaveLength(1);
    run.step(
      dialogueSelect(run.domain, MANIFEST, { requestId: 'r-end', choiceId: 'c_end' }, snapshot())
    );
    expect(run.domain.active?.mode).toBe('ended');
  });
});
