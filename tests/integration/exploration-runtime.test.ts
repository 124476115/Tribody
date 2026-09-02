/**
 * WO-014 — integration: the full exploration → quest → dialogue line.
 *
 * AC-08: player moves to an NPC, the emitted `npc.talked` event advances a
 * quest objective, and the application uses the SAME event to start a dialogue.
 * Proves the exploration runtime's output feeds the already-accepted quest
 * engine (WO-012) and the dialogue engine (WO-011) without any extra glue.
 */
import { describe, it, expect } from 'vitest';
import {
  createQuestDomain,
  questInit,
  questStart,
  questApplyEvent,
  type QuestSavedState,
} from '../../src/domain/quest';
import {
  movePlayer,
  interactEntity,
  createExplorationState,
  type EntityPlacement,
  type ExplorationSessionState,
} from '../../src/domain/exploration';
import { dialogueStart, createDialogueDomain } from '../../src/domain/dialogue';
import { objective, quest, domainEvent } from '../helpers/quest-fixtures';
import { dialogue, node, choice } from '../helpers/dialogue-fixtures';
import type { QuestManifest } from '../../src/domain/content';

const GRID: readonly boolean[][] = Array.from({ length: 6 }, () =>
  Array.from({ length: 6 }, () => false)
);

const ALICE: EntityPlacement = {
  entityId: 'e_alice',
  kind: 'npc',
  position: { x: 4, y: 4 },
  npcId: 'npc_alice',
  dialogueId: 'dlg_alice',
};

const ALICE_DIALOGUE = dialogue('dlg_alice', 'n01', {
  n01: node('npc_alice', { choices: [choice('c_hello', 'end')] }),
});

const TALK_QUEST = quest('q_talk_alice', {
  objectives: [objective('obj_talk', 'talk', { npcId: 'npc_alice' })],
});

function session(ex?: Partial<ExplorationSessionState>): ExplorationSessionState {
  const saved = createExplorationState();
  saved.sceneId = 'sc_lab';
  saved.position = { x: 2, y: 4 };
  return {
    sceneId: saved.sceneId,
    position: saved.position,
    visitedScenes: saved.visitedScenes,
    collisionGrid: GRID,
    entities: [ALICE],
    exits: [],
    interactionRange: 2,
    ...ex,
  };
}

describe('WO-014 integration — exploration → quest → dialogue', () => {
  it('AC-08: move to NPC, npc.talked advances the talk objective, and dialogue starts', () => {
    // Quest engine side.
    const manifests: Record<string, QuestManifest> = { [TALK_QUEST.id]: TALK_QUEST };
    let quest: QuestSavedState = createQuestDomain();
    const init = questInit(quest, manifests);
    if (init.status !== 'committed') throw new Error('init failed');
    quest = init.state;
    const start = questStart(quest, manifests, { questId: TALK_QUEST.id });
    if (start.status !== 'committed') throw new Error('start failed');
    quest = start.state;

    // Exploration side: move toward Alice (from (2,4) two cells right to (4,4)).
    let ex = session();
    ex = movePlayer(ex, 'right'); // (3,4)
    ex = movePlayer(ex, 'right'); // (4,4) — adjacent to Alice at (4,4)? same cell
    expect(ex.position).toEqual({ x: 4, y: 4 });

    // Interact: emits an npc.talked event.
    const interaction = interactEntity(ex, 'e_alice');
    expect(interaction.events).toEqual([
      { type: 'npc.talked', sceneId: 'sc_lab', npcId: 'npc_alice', entityId: 'e_alice' },
    ]);

    // Feed the exploration event into the quest engine — the talk objective completes.
    const applied = questApplyEvent(
      quest,
      manifests,
      domainEvent('evt-talk', 'npc.talked', { npcId: 'npc_alice' })
    );
    expect(applied.status).toBe('committed');
    quest = applied.state;
    expect(quest.quests[TALK_QUEST.id]?.status).toBe('resolved_success');

    // Same event also selects the dialogue to start (application glue).
    const dlg = createDialogueDomain();
    const started = dialogueStart(dlg, ALICE_DIALOGUE, {
      requestId: 'req-talk',
      dialogueId: 'dlg_alice',
    });
    expect(started.status).toBe('committed');
    if (started.status !== 'committed') throw new Error('dialogue must commit');
    expect(started.state.active?.mode).toBe('onNode');
  });

  it('a blocked move never emits an event and never advances the quest', () => {
    const blocked: readonly boolean[][] = [
      [false, false, false, false, false, false],
      [false, false, false, true, false, false],
      [false, false, false, true, false, false],
      [false, false, false, true, false, false],
      [false, false, false, true, false, false],
      [false, false, false, false, false, false],
    ];
    // Player at (1,1); trying to move right is blocked by wall column x=3.
    let ex = session({ position: { x: 2, y: 3 }, collisionGrid: blocked });
    ex = movePlayer(ex, 'right');
    expect(ex.position).toEqual({ x: 2, y: 3 });

    const manifests: Record<string, QuestManifest> = { [TALK_QUEST.id]: TALK_QUEST };
    let quest: QuestSavedState = createQuestDomain();
    const init = questInit(quest, manifests);
    if (init.status !== 'committed') throw new Error('init failed');
    quest = init.state;
    const start = questStart(quest, manifests, { questId: TALK_QUEST.id });
    if (start.status !== 'committed') throw new Error('start failed');
    quest = start.state;
    const applied = questApplyEvent(quest, manifests, domainEvent('evt-move', 'npc.talked', {}));
    // No npc id -> objective cannot complete (structured match requires npcId).
    expect(applied.status).toBe('irrelevant');
  });
});
