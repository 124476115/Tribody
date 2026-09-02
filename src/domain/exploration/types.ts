/**
 * Exploration Domain — core types (FS-EXPLORE-001)
 *
 * Pure TypeScript value contracts for the deterministic exploration runtime.
 * No Phaser, React, Zod, or Node.js built-ins.
 */

/** Grid-based position (abstract; Phaser adapter maps to pixels). */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/** Entity placement within a scene. */
export interface EntityPlacement {
  readonly entityId: string;
  readonly kind: 'npc' | 'interactable';
  readonly position: Position;
  readonly npcId?: string | undefined;
  readonly dialogueId?: string | undefined;
}

/** Exit placement within a scene. */
export interface ExitPlacement {
  readonly exitId: string;
  readonly labelKey: string;
  readonly toSceneId: string;
  readonly position: Position;
}

/** Persistent exploration state (saved by WO-013). */
export interface ExplorationSavedState {
  sceneId: string;
  position: Position;
  visitedScenes: string[];
}

/** Transient session state (not persisted). */
export interface ExplorationSessionState {
  readonly sceneId: string;
  /**
   * Player grid position. `null` means the scene was entered with an
   * unresolved/unknown spawn point — the player is awaiting spawn resolution.
   * The domain NEVER fabricates a coordinate for an unresolved spawn; consumers
   * must resolve a real position (from the spawn table / adapter) before
   * positional logic applies.
   */
  readonly position: Position | null;
  readonly visitedScenes: readonly string[];
  readonly collisionGrid: readonly boolean[][];
  readonly entities: readonly EntityPlacement[];
  readonly exits: readonly ExitPlacement[];
  readonly interactionRange: number;
}

/**
 * Explicit spawn resolution. The pure domain cannot resolve a *named* spawn id
 * to a coordinate (that needs a content/level table, out of scope for WO-014).
 * A caller supplying an unresolved spawn opts into the awaiting-spawn state
 * instead of a fabricated coordinate.
 */
export type SpawnResolution =
  | { readonly status: 'resolved'; readonly position: Position }
  | { readonly status: 'unresolved'; readonly reason: 'unknown-spawn' | 'no-spawn-table' };

export type ExploreErrorCode = 'exit-not-found' | 'exit-out-of-range';

/** Typed, deterministic exploration failure. Consumers branch on `.code`. */
export class ExploreDomainError extends Error {
  readonly code: ExploreErrorCode;

  constructor(code: ExploreErrorCode, message: string) {
    super(message);
    this.name = 'ExploreDomainError';
    this.code = code;
  }
}

export type ExitSceneResult =
  | { readonly status: 'ok'; readonly targetSceneId: string; readonly events: ExplorationEvent[] }
  | { readonly status: 'error'; readonly error: ExploreDomainError };

/** Events emitted by the exploration runtime. */
export type ExplorationEvent =
  | { readonly type: 'scene.entered'; readonly sceneId: string }
  | { readonly type: 'world.interaction'; readonly sceneId: string; readonly entityId: string }
  | {
      readonly type: 'npc.talked';
      readonly sceneId: string;
      readonly npcId: string;
      readonly entityId: string;
    };

/** Movement direction. */
export type Direction = 'up' | 'down' | 'left' | 'right';
