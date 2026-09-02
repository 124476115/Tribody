/**
 * FS-SKILL-001 AC-12 — integration: parked dialogue skill check → checks
 * coordinator (reads current progression + current skills, resolves the
 * deterministic RollV1 tier) → binary dialogue edge (clear/costly → passed,
 * failed → failed) through the real WO-011 dialogue runtime and sample content.
 *
 * Also proves current-state-at-resolution through the real pipeline: the same
 * parked check resolves to a different tier if the player's canonical state
 * changed between parking and resolution (a reload that raised an attribute or
 * learned the skill deterministically rescues the check).
 */
import { describe, it, expect } from 'vitest';
import {
  createDialogueDomain,
  dialogueStart,
  dialogueSelect,
  dialogueResolveSkillCheck,
  getPendingSkillCheck,
  type DialogueSavedState,
} from '../../src/domain/dialogue';
import { sampleDialogue, snapshot } from '../helpers/dialogue-fixtures';
import { resolveCoordinatedCheck } from '../../src/application/checks/coordinator';
import type { DialogueManifest, SkillCheck } from '../../src/domain/content';
import {
  createProgressionState,
  activatePc,
  type ProgressionSavedState,
} from '../../src/domain/progression';
import { createSkillsState, learnSkill } from '../../src/domain/skills';

const SKILL_ID = 'skill_scientist_experimental_design';

/** Drive the sample dialogue to a parked `awaitingSkillCheck` state. */
function parkedDialogue(): DialogueSavedState {
  const manifest = sampleDialogue();
  let dialogue = createDialogueDomain();
  const start = dialogueStart(dialogue, manifest, {
    requestId: 'ReqStart',
    dialogueId: manifest.id,
  });
  if (start.status !== 'committed') throw new Error('start');
  dialogue = start.state;
  const selB = dialogueSelect(
    dialogue,
    manifest,
    { requestId: 'ReqSelB', choiceId: 'c_b' },
    snapshot()
  );
  if (selB.status !== 'committed') throw new Error('select c_b');
  dialogue = selB.state;
  const selSkill = dialogueSelect(
    dialogue,
    manifest,
    { requestId: 'ReqSelSkill', choiceId: 'c_skill' },
    snapshot()
  );
  if (selSkill.status !== 'committed') throw new Error('select c_skill');
  dialogue = selSkill.state;
  if (dialogue.active?.mode !== 'awaitingSkillCheck') throw new Error('park');
  return dialogue;
}

function baseProgression(): ProgressionSavedState {
  return activatePc(createProgressionState(), 'pc_wang');
}

describe('FS-SKILL-001 checks coordinator integration', () => {
  it('AC-12: resolves a parked check from current state and maps the tier to the dialogue binary outcome', () => {
    const dialogue = parkedDialogue();
    const session = dialogue.active;
    if (session === null) throw new Error('no session');
    const manifest = sampleDialogue();
    const pending = getPendingSkillCheck(session, manifest);
    expect(pending?.skillId).toBe(SKILL_ID);
    expect(pending?.threshold).toBe(1);

    const outcome = resolveCoordinatedCheck({
      dialogue,
      progression: baseProgression(),
      skills: createSkillsState(),
      pcId: 'pc_wang',
      content: manifest,
    });
    // RollV1 identity: dlg_sample_conversation#1#n03#c_skill#skill_scientist_experimental_design.
    expect(outcome.roll).toBe(3);
    expect(outcome.attempts).toBe(0);
    // intellect=1, skill=0 => score 1; result 4 >= threshold(1)+clearMargin(3) => clear.
    expect(outcome.score).toBe(1);
    expect(outcome.result).toBe(4);
    expect(outcome.tier).toBe('clear');
    expect(outcome.dialogueOutcome).toBe('passed');

    // The dialogue edge consumes the mapped binary outcome and commits.
    const resolved = dialogueResolveSkillCheck(dialogue, manifest, {
      requestId: 'ReqResolve',
      choiceId: 'c_skill',
      outcome: outcome.dialogueOutcome,
    });
    expect(resolved.status).toBe('committed');
    if (resolved.status !== 'committed') throw new Error('resolve');
    expect(resolved.state.active?.mode).toBe('onNode');
    expect(resolved.state.active?.nodeId).toBe('n04');
  });

  it('AC-12: failure maps failed and the dialogue commits the failure branch', () => {
    // A high threshold with weak state forces `failed`.
    const manifest = sampleDialogue();
    const n03 = manifest.nodes['n03'];
    if (n03 === undefined) throw new Error('fixture');
    const skillChoice = n03.choices.find((c) => c.id === 'c_skill');
    if (skillChoice === undefined || skillChoice.skillCheck === undefined) {
      throw new Error('fixture');
    }
    const hardSkillCheck: SkillCheck = { ...skillChoice.skillCheck, threshold: 30 };
    const hard: DialogueManifest = {
      ...manifest,
      nodes: {
        ...manifest.nodes,
        n03: {
          ...n03,
          choices: n03.choices.map((c) =>
            c === skillChoice ? { ...c, skillCheck: hardSkillCheck } : c
          ),
        },
      },
    };
    let dialogue = createDialogueDomain();
    const start = dialogueStart(dialogue, hard, { requestId: 'S', dialogueId: hard.id });
    if (start.status !== 'committed') throw new Error('start');
    dialogue = start.state;
    const selB = dialogueSelect(dialogue, hard, { requestId: 'B', choiceId: 'c_b' }, snapshot());
    if (selB.status !== 'committed') throw new Error('c_b');
    dialogue = selB.state;
    const selSkill = dialogueSelect(
      dialogue,
      hard,
      { requestId: 'K', choiceId: 'c_skill' },
      snapshot()
    );
    if (selSkill.status !== 'committed') throw new Error('c_skill');
    dialogue = selSkill.state;

    const outcome = resolveCoordinatedCheck({
      dialogue,
      progression: baseProgression(),
      skills: createSkillsState(),
      pcId: 'pc_wang',
      content: hard,
    });
    expect(outcome.tier).toBe('failed');
    expect(outcome.dialogueOutcome).toBe('failed');
  });

  it('AC-11/AC-12: the parked check resolves against CURRENT canonical state — learning the skill rescues it', () => {
    const dialogue = parkedDialogue();
    const manifest = sampleDialogue();

    const unlearned = resolveCoordinatedCheck({
      dialogue,
      progression: baseProgression(),
      skills: createSkillsState(),
      pcId: 'pc_wang',
      content: manifest,
    });

    let skills = createSkillsState();
    skills = learnSkill(skills, {
      pcId: 'pc_wang',
      skillId: SKILL_ID,
      occurrenceId: 'occ-9',
    }).state;
    const learned = resolveCoordinatedCheck({
      dialogue,
      progression: baseProgression(),
      skills,
      pcId: 'pc_wang',
      content: manifest,
    });

    expect(learned.score).toBe(unlearned.score + 1);
    expect(learned.tier === 'clear' || unlearned.tier === 'clear').toBe(true);
    // Same parked check identity => the roll never changes across state changes/reloads.
    expect(learned.roll).toBe(unlearned.roll);
    expect(learned.roll).toBe(3);
  });
});
