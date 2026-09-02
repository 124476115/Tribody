/**
 * Exploration Runtime — deterministic state machine (FS-EXPLORE-001)
 *
 * Pure, deterministic, fully serializable. One step commits exactly one
 * transition. Errors are typed results that leave the previous state unchanged.
 */
import type {
  Direction,
  EntityPlacement,
  ExplorationEvent,
  ExplorationSavedState,
  ExplorationSessionState,
  ExitPlacement,
  ExitSceneResult,
  Position,
  SpawnResolution,
} from './types';
import { ExploreDomainError } from './types';

/** Create a default exploration state. */
export function createExplorationState(): ExplorationSavedState {
  return { sceneId: '', position: { x: 0, y: 0 }, visitedScenes: [] };
}

/**
 * Enter a scene. `spawn` is an explicit SpawnResolution: a `resolved` position
 * (authoritative coordinate supplied by the caller) places the player there; an
 * `unresolved` spawn yields a session with `position === null` (awaiting spawn
 * resolution). The domain never fabricates `(0,0)` for an unresolved spawn.
 */
export function enterScene(
  saved: ExplorationSavedState,
  sessionBase: Omit<ExplorationSessionState, 'sceneId' | 'position'>,
  sceneId: string,
  spawn: SpawnResolution
): ExplorationSessionState {
  const visited = saved.visitedScenes.includes(sceneId)
    ? saved.visitedScenes
    : [...saved.visitedScenes, sceneId];
  const position = spawn.status === 'resolved' ? spawn.position : null;
  return { ...sessionBase, sceneId, position, visitedScenes: visited };
}

/** Move the player one grid cell in the given direction. */
export function movePlayer(
  state: ExplorationSessionState,
  direction: Direction
): ExplorationSessionState {
  if (state.position === null) return state;
  const delta = directionDelta(direction);
  const nx = state.position.x + delta.x;
  const ny = state.position.y + delta.y;
  if (!isInsideGrid(state.collisionGrid, nx, ny)) return state;
  if (state.collisionGrid[ny]?.[nx] === true) return state;
  return { ...state, position: { x: nx, y: ny } };
}

/** Interact with an entity (NPC or interactable). */
export function interactEntity(
  state: ExplorationSessionState,
  entityId: string
): { state: ExplorationSessionState; events: ExplorationEvent[] } {
  if (state.position === null) return { state, events: [] };
  const entity = state.entities.find((e) => e.entityId === entityId);
  if (entity === undefined) return { state, events: [] };
  if (chebyshevDistance(state.position, entity.position) > state.interactionRange) {
    return { state, events: [] };
  }
  const events = buildInteractionEvents(state, entity);
  return { state: { ...state }, events };
}

/**
 * Activate an exit. Returns a typed result: `ok` with the target scene, or a
 * typed `ExploreDomainError` (`exit-not-found` / `exit-out-of-range`). Never
 * throws a bare Error and never emits events for a failing exit.
 */
export function exitScene(state: ExplorationSessionState, exitId: string): ExitSceneResult {
  const exit = state.exits.find((e) => e.exitId === exitId);
  if (exit === undefined) {
    return {
      status: 'error',
      error: new ExploreDomainError('exit-not-found', `unknown exit "${exitId}"`),
    };
  }
  const position = state.position;
  if (position === null || chebyshevDistance(position, exit.position) > state.interactionRange) {
    return {
      status: 'error',
      error: new ExploreDomainError('exit-out-of-range', `exit "${exitId}" out of range`),
    };
  }
  return { status: 'ok', targetSceneId: exit.toSceneId, events: [] };
}

/** All entities within interaction range. */
export function nearbyEntities(state: ExplorationSessionState): EntityPlacement[] {
  const position = state.position;
  if (position === null) return [];
  return state.entities.filter(
    (e) => chebyshevDistance(position, e.position) <= state.interactionRange
  );
}

/** All exits within interaction range. */
export function nearbyExits(state: ExplorationSessionState): ExitPlacement[] {
  const position = state.position;
  if (position === null) return [];
  return state.exits.filter(
    (e) => chebyshevDistance(position, e.position) <= state.interactionRange
  );
}

/** Chebyshev distance between two grid positions. */
export function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// --- internal helpers -------------------------------------------------------

function directionDelta(direction: Direction): Position {
  switch (direction) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

function isInsideGrid(grid: readonly boolean[][], x: number, y: number): boolean {
  if (y < 0 || y >= grid.length) return false;
  const row = grid[y];
  return row !== undefined && x >= 0 && x < row.length;
}

function buildInteractionEvents(
  state: ExplorationSessionState,
  entity: EntityPlacement
): ExplorationEvent[] {
  if (entity.kind === 'npc' && entity.npcId !== undefined) {
    return [
      {
        type: 'npc.talked',
        sceneId: state.sceneId,
        npcId: entity.npcId,
        entityId: entity.entityId,
      },
    ];
  }
  return [{ type: 'world.interaction', sceneId: state.sceneId, entityId: entity.entityId }];
}
