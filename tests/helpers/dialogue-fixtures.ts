/**
 * Dialogue runtime test fixtures (WO-011).
 *
 * Mirrors the shape of `content_examples/dialogue_ch04_sample.yaml` (branching,
 * loop, skill check, codex/relationship effects) with abstract text and stable
 * ids only — no production prose.
 */
import {
  type DialogueManifest,
  type DialogueNodeManifest,
  type DialogueChoiceManifest,
  type Condition,
  type Effect,
} from '../../src/domain/content';
import type { DialogueSnapshot } from '../../src/domain/dialogue';

export function choice(
  id: string,
  next: string,
  opts: {
    conditions?: Condition[];
    effects?: Effect[];
    skillCheck?: { skillId: string; threshold: number };
  } = {}
): DialogueChoiceManifest {
  return {
    id,
    textKey: `dlg.test.${id}`,
    conditions: opts.conditions ?? [],
    effects: opts.effects ?? [],
    ...(opts.skillCheck !== undefined ? { skillCheck: opts.skillCheck } : {}),
    next,
  };
}

export function node(
  speaker: string,
  options: {
    textKey?: string;
    voiceCueId?: string;
    onEnterEffects?: Effect[];
    choices?: DialogueChoiceManifest[];
    autoNext?: string;
  } = {}
): DialogueNodeManifest {
  return {
    speaker,
    ...(options.textKey !== undefined
      ? { textKey: options.textKey }
      : { textKey: `node.line.${speaker}` }),
    ...(options.voiceCueId !== undefined ? { voiceCueId: options.voiceCueId } : {}),
    tags: [],
    onEnterEffects: options.onEnterEffects ?? [],
    choices: options.choices ?? [],
    ...(options.autoNext !== undefined ? { autoNext: options.autoNext } : {}),
  };
}

export function dialogue(
  id: string,
  entryNode: string,
  nodes: Record<string, DialogueNodeManifest>
): DialogueManifest {
  return { id, entryNode, nodes };
}

/** Branching + loop + skill-check + effect sample, structurally equivalent to the WO-010 sample. */
export function sampleDialogue(): DialogueManifest {
  const questEvent = (event: string): Effect => ({ kind: 'quest_event', event });
  const adjustRelationship = (npcId: string, dimension: string, amount: number): Effect => ({
    kind: 'adjust_relationship',
    npcId,
    dimension,
    amount,
  });
  const addCodex = (codexId: string): Effect => ({ kind: 'add_codex', codexId });

  return dialogue('dlg_sample_conversation', 'n01', {
    n01: node('npc_lab_colleague', {
      choices: [
        choice('c_a', 'n02', {
          conditions: [{ kind: 'flag', flag: 'flag.ch04.data.a' }],
          effects: [questEvent('ch04.raw_data_compare_requested')],
        }),
        choice('c_b', 'n03', {
          effects: [adjustRelationship('npc_lab_colleague', 'trust', -2)],
        }),
      ],
    }),
    n02: node('npc_lab_colleague', {
      choices: [choice('c_back', 'n01'), choice('c_done', 'end')],
    }),
    n03: node('npc_lab_colleague', {
      choices: [
        choice('c_skill', 'n04', {
          skillCheck: { skillId: 'skill_scientist_experimental_design', threshold: 1 },
        }),
        choice('c_leave', 'end', {
          effects: [adjustRelationship('npc_lab_colleague', 'familiarity', 2)],
        }),
      ],
    }),
    n04: node('npc_lab_colleague', {
      onEnterEffects: [addCodex('codex_science_falsifiability')],
      choices: [choice('c_end', 'end')],
    }),
  });
}

/** A node with an auto-next chain (each step advances exactly one node). */
export function autoNextDialogue(): DialogueManifest {
  return dialogue('dlg_autonext_chain', 'n01', {
    n01: node('npc_colleague', { autoNext: 'n02' }),
    n02: node('npc_colleague', { autoNext: 'n03' }),
    n03: node('npc_colleague', { autoNext: 'end' }),
  });
}

export function snapshot(overrides: Partial<DialogueSnapshot> = {}): DialogueSnapshot {
  return {
    activeChapterId: 'ch_common_04_countdown',
    activeSceneId: 'sc_ch04_lab_morning',
    flags: {},
    questStates: {},
    relationships: {},
    skillValues: {},
    itemCounts: {},
    codexUnlocked: {},
    ...overrides,
  };
}
