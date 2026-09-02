/**
 * WO-014 Exploration Runtime — unit tests (FS-EXPLORE-001)
 *
 * AC-01 through AC-10. All pure domain logic; no Phaser/React.
 */
import { describe, it, expect } from 'vitest';
import {
  createExplorationState,
  enterScene,
  movePlayer,
  interactEntity,
  exitScene,
  nearbyEntities,
  chebyshevDistance,
  type ExplorationSessionState,
  type EntityPlacement,
  type ExitPlacement,
} from '../../../src/domain/exploration';

/** 5×5 open grid (no walls). */
const OPEN_GRID: readonly boolean[][] = Array.from({ length: 5 }, () =>
  Array.from({ length: 5 }, () => false)
);

/** 5×5 grid with a wall at (2,2). */
const GRID_WITH_WALL: readonly boolean[][] = [
  [false, false, false, false, false],
  [false, false, false, false, false],
  [false, false, true, false, false],
  [false, false, false, false, false],
  [false, false, false, false, false],
];

const NPC_ALICE: EntityPlacement = {
  entityId: 'e_alice',
  kind: 'npc',
  position: { x: 3, y: 1 },
  npcId: 'npc_alice',
  dialogueId: 'dlg_alice_intro',
};

const INTERACTABLE_CHEST: EntityPlacement = {
  entityId: 'e_chest',
  kind: 'interactable',
  position: { x: 1, y: 3 },
};

const EXIT_NORTH: ExitPlacement = {
  exitId: 'exit_north',
  labelKey: 'exit.lab_hallway',
  toSceneId: 'sc_lab_hallway',
  position: { x: 2, y: 0 },
};

function makeSession(overrides: Partial<ExplorationSessionState> = {}): ExplorationSessionState {
  return {
    sceneId: 'sc_lab',
    position: { x: 2, y: 2 },
    visitedScenes: ['sc_lab'],
    collisionGrid: OPEN_GRID,
    entities: [NPC_ALICE, INTERACTABLE_CHEST],
    exits: [EXIT_NORTH],
    interactionRange: 2,
    ...overrides,
  };
}

describe('WO-014 Exploration Runtime', () => {
  describe('chebyshevDistance', () => {
    it('same position is distance 0', () => {
      expect(chebyshevDistance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    });

    it('diagonal distance is max of deltas', () => {
      expect(chebyshevDistance({ x: 1, y: 2 }, { x: 4, y: 5 })).toBe(3);
    });
  });

  describe('AC-01: movement validates against collision grid', () => {
    it('open grid: move succeeds', () => {
      const s = makeSession();
      const moved = movePlayer(s, 'right');
      expect(moved.position).toEqual({ x: 3, y: 2 });
      expect(moved.sceneId).toBe('sc_lab');
    });

    it('blocked cell: position unchanged', () => {
      // Move FROM (1,2) INTO the wall at (2,2).
      const start = makeSession({ position: { x: 1, y: 2 }, collisionGrid: GRID_WITH_WALL });
      const moved = movePlayer(start, 'right');
      expect(moved.position).toEqual({ x: 1, y: 2 });
    });

    it('out of bounds: position unchanged', () => {
      const s = makeSession({ position: { x: 0, y: 0 } });
      const moved = movePlayer(s, 'up');
      expect(moved.position).toEqual({ x: 0, y: 0 });
    });

    it('negative coords: position unchanged', () => {
      const s = makeSession({ position: { x: 0, y: 4 } });
      const moved = movePlayer(s, 'down');
      expect(moved.position).toEqual({ x: 0, y: 4 });
    });

    it('no resolved position: movement leaves the awaiting-spawn state', () => {
      const s = makeSession({ position: null });
      const moved = movePlayer(s, 'right');
      expect(moved.position).toBeNull();
    });
  });

  describe('AC-02: interaction checks range', () => {
    it('entity within range: interaction succeeds', () => {
      const s = makeSession({ position: { x: 2, y: 1 } }); // 1 cell from Alice at (3,1)
      const result = interactEntity(s, 'e_alice');
      expect(result.events.length).toBeGreaterThan(0);
    });

    it('entity out of range: no events', () => {
      const s = makeSession({ position: { x: 0, y: 4 } }); // far from Alice at (3,1)
      const result = interactEntity(s, 'e_alice');
      expect(result.events).toEqual([]);
    });

    it('unknown entity: no events', () => {
      const s = makeSession();
      const result = interactEntity(s, 'e_nonexistent');
      expect(result.events).toEqual([]);
    });

    it('no resolved position: no interaction events', () => {
      const s = makeSession({ position: null });
      const result = interactEntity(s, 'e_alice');
      expect(result.events).toEqual([]);
    });
  });

  describe('AC-03: NPC interaction emits npc.talked', () => {
    it('interact with NPC emits npc.talked with correct npcId', () => {
      const s = makeSession({ position: { x: 2, y: 1 } }); // close to Alice
      const result = interactEntity(s, 'e_alice');
      expect(result.events).toEqual([
        { type: 'npc.talked', sceneId: 'sc_lab', npcId: 'npc_alice', entityId: 'e_alice' },
      ]);
    });
  });

  describe('AC-04: non-NPC interaction emits world.interaction', () => {
    it('interact with chest emits world.interaction', () => {
      const s = makeSession({ position: { x: 1, y: 2 } }); // close to chest at (1,3)
      const result = interactEntity(s, 'e_chest');
      expect(result.events).toEqual([
        { type: 'world.interaction', sceneId: 'sc_lab', entityId: 'e_chest' },
      ]);
    });
  });

  describe('AC-05: exitScene returns a typed result', () => {
    it('valid exit returns ok with target scene and empty events', () => {
      const s = makeSession({ position: { x: 2, y: 1 } }); // close to exit at (2,0)
      const result = exitScene(s, 'exit_north');
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') throw new Error('expected ok');
      expect(result.targetSceneId).toBe('sc_lab_hallway');
      expect(result.events).toEqual([]);
    });

    it('unknown exit is a typed exit-not-found failure, not a throw', () => {
      const s = makeSession();
      const result = exitScene(s, 'exit_nonexistent');
      expect(result.status).toBe('error');
      if (result.status !== 'error') throw new Error('expected error');
      expect(result.error.code).toBe('exit-not-found');
      expect(result.error).toBeInstanceOf(Error);
    });

    it('exit out of range is a typed exit-out-of-range failure, not a throw', () => {
      const s = makeSession({ position: { x: 0, y: 4 } });
      const result = exitScene(s, 'exit_north');
      expect(result.status).toBe('error');
      if (result.status !== 'error') throw new Error('expected error');
      expect(result.error.code).toBe('exit-out-of-range');
    });

    it('exitScene with no resolved position fails typed with exit-out-of-range', () => {
      const s = makeSession({ position: null });
      const result = exitScene(s, 'exit_north');
      expect(result.status).toBe('error');
      if (result.status !== 'error') throw new Error('expected error');
      expect(result.error.code).toBe('exit-out-of-range');
    });
  });

  describe('AC-06: nearbyEntities returns entities within range', () => {
    it('close to both: returns both', () => {
      const s = makeSession({ position: { x: 2, y: 2 } }); // range 2 covers both
      const near = nearbyEntities(s);
      expect(near.map((e) => e.entityId).sort()).toEqual(['e_alice', 'e_chest']);
    });

    it('close to only one: returns one', () => {
      const s = makeSession({ position: { x: 3, y: 0 } }); // Alice at (3,1) dist=1, chest at (1,3) dist=3
      const near = nearbyEntities(s);
      expect(near.map((e) => e.entityId)).toEqual(['e_alice']);
    });

    it('far from all: returns empty', () => {
      const s = makeSession({ position: { x: 4, y: 4 }, entities: [NPC_ALICE] });
      const near = nearbyEntities(s);
      expect(near).toEqual([]);
    });
  });

  describe('AC-07: enterScene resolves the spawn position explicitly', () => {
    it('resolved spawn places the player at the authored coordinate', () => {
      const saved = createExplorationState();
      const base = makeSession();
      const entered = enterScene(saved, base, 'sc_hallway', {
        status: 'resolved',
        position: { x: 5, y: 3 },
      });
      expect(entered.sceneId).toBe('sc_hallway');
      expect(entered.position).toEqual({ x: 5, y: 3 });
    });

    it('resolved spawn marks the scene visited', () => {
      const saved = createExplorationState();
      saved.visitedScenes = ['sc_old'];
      const base = makeSession();
      const entered = enterScene(saved, base, 'sc_hallway', {
        status: 'resolved',
        position: { x: 1, y: 1 },
      });
      expect(entered.visitedScenes).toEqual(['sc_old', 'sc_hallway']);
    });

    it('RED: an unresolved named spawn cannot masquerade as (0,0)', () => {
      const saved = createExplorationState();
      const base = makeSession();
      const entered = enterScene(saved, base, 'sc_hallway', {
        status: 'unresolved',
        reason: 'unknown-spawn',
      });
      expect(entered.position).toBeNull();
      expect(entered.position).not.toEqual({ x: 0, y: 0 });
    });
  });

  describe('AC-09: exploration state round-trips', () => {
    it('saved state is JSON-safe and re readable', () => {
      const saved = createExplorationState();
      saved.sceneId = 'sc_lab';
      saved.position = { x: 3, y: 1 };
      saved.visitedScenes = ['sc_lab', 'sc_hallway'];
      const json = JSON.stringify(saved);
      const restored = JSON.parse(json) as ExplorationSessionState;
      expect(restored.sceneId).toBe('sc_lab');
      expect(restored.position).toEqual({ x: 3, y: 1 });
    });
  });

  describe('AC-10: deterministic purity', () => {
    it('movePlayer returns a new object (no mutation)', () => {
      const s = makeSession();
      const moved = movePlayer(s, 'right');
      expect(moved).not.toBe(s);
      expect(s.position).toEqual({ x: 2, y: 2 });
      expect(moved.position).toEqual({ x: 3, y: 2 });
    });

    it('interactEntity returns new state (no mutation)', () => {
      const s = makeSession({ position: { x: 2, y: 1 } });
      const result = interactEntity(s, 'e_alice');
      expect(result.state).not.toBe(s);
    });
  });
});
