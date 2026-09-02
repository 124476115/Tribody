/**
 * FS-DIALOGUE-001 — deterministic equivalent input → equivalent output (AC-10).
 *
 * The runtime must be insensitive to the key-insertion order of the maps it
 * receives (WO-010 already key-sorts manifest maps; this proves the runtime
 * does not accidentally depend on construction order).
 */
import { describe, it, expect } from 'vitest';
import {
  createDialogueDomain,
  dialogueStart,
  dialogueSelect,
  dialogueResolveSkillCheck,
  type DialogueResult,
  type DialogueSavedState,
} from '../../../src/domain/dialogue';
import type { DialogueManifest } from '../../../src/domain/content';
import { sampleDialogue, snapshot } from '../../helpers/dialogue-fixtures';
import { required } from '../../helpers/content-fixtures';

const BASE = sampleDialogue();

function runAgainst(manifest: DialogueManifest): {
  transitionIds: string[];
  historyCount: number;
  finalSerialized: string;
} {
  let domain: DialogueSavedState = createDialogueDomain();
  const transitionIds: string[] = [];

  const collect = (r: DialogueResult): void => {
    if (r.status === 'error') throw new Error(`unexpected runtime error: ${String(r.error.code)}`);
    if (r.status === 'committed') transitionIds.push(r.transition.transitionId);
    domain = r.state;
  };

  collect(dialogueStart(domain, manifest, { requestId: 'r0', dialogueId: manifest.id }));
  collect(dialogueSelect(domain, manifest, { requestId: 'r1', choiceId: 'c_b' }, snapshot()));
  collect(dialogueSelect(domain, manifest, { requestId: 'r2', choiceId: 'c_skill' }, snapshot()));
  collect(
    dialogueResolveSkillCheck(domain, manifest, {
      requestId: 'r3',
      choiceId: 'c_skill',
      outcome: 'passed',
    })
  );
  collect(dialogueSelect(domain, manifest, { requestId: 'r4', choiceId: 'c_end' }, snapshot()));

  return {
    transitionIds,
    historyCount: requiredActive(domain).history.length,
    finalSerialized: JSON.stringify(domain),
  };
}

function requiredActive(state: DialogueSavedState): NonNullable<DialogueSavedState['active']> {
  if (state.active === null) throw new Error('active expected');
  return state.active;
}

describe('WO-011 determinism', () => {
  it('AC-10: node map insertion order does not affect the transition sequence or serialized state', () => {
    const forward = runAgainst(BASE);
    const reversedOrder: DialogueManifest = {
      ...BASE,
      nodes: {
        n04: required(BASE.nodes['n04'], 'n04'),
        n03: required(BASE.nodes['n03'], 'n03'),
        n02: required(BASE.nodes['n02'], 'n02'),
        n01: required(BASE.nodes['n01'], 'n01'),
      },
    };
    const reversed = runAgainst(reversedOrder);

    expect(reversed.transitionIds).toEqual(forward.transitionIds);
    expect(reversed.historyCount).toBe(forward.historyCount);
    expect(reversed.finalSerialized).toBe(forward.finalSerialized);
  });
});
