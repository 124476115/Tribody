# FS-EXPLORE-001 — Exploration Interaction

## Status

**Implemented** for WO-014 (Gate 1). Pure domain runtime + save schema v2
integration are complete (21 unit tests, 1 integration test, save schema v2
tests). Phaser rendering / input / HUD are deferred to WO-030 (out of scope).

## Problem

The game requires a deterministic, data-driven exploration layer that lets the
player navigate scenes, approach NPCs and interactables, trigger scene exits,
and start conversations — all without embedding rendering or input logic in the
domain. The exploration runtime must emit the exact event types
(`scene.entered`, `world.interaction`, `npc.talked`) that the quest engine
(WO-012) already consumes, and its state must be fully saveable (WO-013).

## Player value

The player moves through the world, encounters characters, triggers dialogue,
and progresses quests through spatial exploration rather than menu navigation.

## Scope

### In

- Pure domain runtime: `src/domain/exploration/` (no Phaser, React, or browser
  APIs).
- Abstract grid-based player position (`{ x: number; y: number }`).
- Collision grid: 2D boolean mask; domain validates movement against it.
- Entity placement: NPCs and interactables at known grid positions within a
  scene.
- Interaction range: configurable distance threshold (Chebyshev distance).
- Movement: `movePlayer(state, direction)` validates + commits.
- Interaction: `interactEntity(state, entityId)` checks proximity, emits
  `world.interaction` or `npc.talked` events.
- Scene transition: `exitScene(state, exitId)` checks proximity to exit,
  returns the target scene id; caller emits `scene.entered`.
- Spawn: `enterScene(state, sceneId, spawn)` — explicit `SpawnResolution`
  (`resolved` position | `unresolved`), never a fabricated coordinate.
- Interaction prompt data: `nearbyEntities(state)` returns entities within
  interaction range (for UI to show prompt).
- Adapter interface (`ExplorationPort`): how the game layer talks to the domain
  (collision grid loading, scene manifest queries).
- Serialization contract (`ExplorationSavedState`) for WO-013 integration.
- Unit tests (`tests/unit/exploration/`).
- Integration test (`tests/integration/exploration-runtime.test.ts`): full
  move → interact → dialogue start flow using test doubles.
- E2E move → interact → dialogue flow: deferred to WO-030 (requires Phaser
  scene + input wiring; the browser harness already proves the save/reload path
  in `tests/e2e/reload.spec.ts`).

### Out

- Phaser scene rendering, tilemaps, sprites, camera, animations.
- Pixel-level collision (domain uses grid; Phaser adapter maps grid → pixel).
- Input capture (keyboard/touch); the adapter receives GameCommands.
- Interaction prompt UI / HUD (WO-030).
- Audio playback (WO-031).
- NPC AI, pathfinding, or movement.
- Inventory, skills, relationships, XP (Gate 2).
- Save persistence (WO-013 owns the save surface; this WO defines the
  serializable state shape).
- Content pipeline changes (collision data is programmatic in WO-014, not
  authored in content files).

## User flow

1. Player enters a scene → application calls `enterScene(domain, sceneId,
spawn)` with the scene's collision grid and entity placements. `spawn` is either
   a `resolved` position (from the spawn point table / adapter) or `unresolved`
   (awaiting spawn resolution — `position === null`, never `(0,0)`).
2. Domain positions the player at the spawn point; returns committed state.
3. Player presses movement key → application dispatches `movePlayer(domain,
direction)`.
4. Domain validates against collision grid; if valid, updates position; returns
   new state.
5. Player approaches an NPC/interactable → `nearbyEntities(state)` returns it;
   UI shows interaction prompt.
6. Player presses interact → application dispatches `interactEntity(state,
entityId)`.
7. Domain checks proximity, emits `world.interaction` (or `npc.talked` if the
   entity is an NPC); returns new state + events.
8. Application observes `npc.talked` event → starts dialogue via
   `dialogueStart(...)`.
9. Player approaches an exit → `nearbyEntities(state)` or `nearbyExits(state)`
   returns it; UI shows exit prompt.
10. Player activates exit → application dispatches `exitScene(state, exitId)`.
11. Domain returns the target scene id; application loads the new scene and
    calls `enterScene(...)`; emits `scene.entered` event.

## State machine

```
idle ── enterScene(sceneId, spawn) ──▶ exploring(sceneId, position|null)
exploring ── movePlayer(direction) ──▶ exploring(sceneId, newPosition)       [if valid]
exploring ── movePlayer(direction) ──▶ exploring(sceneId, samePosition)      [if blocked]
exploring ── interactEntity(entityId) ──▶ exploring(sceneId, position)       [events emitted]
exploring ── exitScene(exitId) ──▶ idle                                     [returns targetSceneId]
```

- `idle` is represented structurally as "no active exploration session".
- Movement that would place the player out of bounds or into a blocked cell is
  rejected (position unchanged, no event).
- Interaction with an entity out of range is rejected.
- Exit activation with the exit out of range is rejected.

## Domain model

All contracts live in `src/domain/exploration/` (pure TypeScript, no Phaser/
React/Zod/Node.js; depends only on `src/domain/content` contracts).

### ExplorationSavedState (persisted)

```ts
interface ExplorationSavedState {
  sceneId: string;
  position: { x: number; y: number };
  visitedScenes: string[];
}
```

### ExplorationSessionState (transient, not persisted)

`position` is `null` when the player is awaiting spawn resolution — the domain
NEVER fabricates `(0,0)` for an unresolved/unknown named spawn. A resolved
position is only ever an authored, caller-supplied coordinate.

```ts
interface ExplorationSessionState {
  sceneId: string;
  position: { x: number; y: number } | null; // null = awaiting spawn resolution
  visitedScenes: string[];
  collisionGrid: readonly boolean[][];
  entities: readonly EntityPlacement[];
  exits: readonly ExitPlacement[];
  interactionRange: number;
}

interface EntityPlacement {
  entityId: string;
  kind: 'npc' | 'interactable';
  position: { x: number; y: number };
  npcId?: string;
  dialogueId?: string;
}

interface ExitPlacement {
  exitId: string;
  labelKey: string;
  toSceneId: string;
  position: { x: number; y: number };
}
```

### Spawn resolution + typed failure

```ts
// Explicit spawn: the pure domain cannot resolve a *named* spawn id to a
// coordinate (needs a level/spawn table, owned by a later WO). A caller
// supplying `unresolved` opts into the awaiting-spawn state instead of a
// fabricated coordinate.
type SpawnResolution =
  | { status: 'resolved'; position: { x: number; y: number } }
  | { status: 'unresolved'; reason: 'unknown-spawn' | 'no-spawn-table' };

type ExploreErrorCode = 'exit-not-found' | 'exit-out-of-range';

class ExploreDomainError extends Error {
  code: ExploreErrorCode;
}

type ExitSceneResult =
  | { status: 'ok'; targetSceneId: string; events: ExplorationEvent[] }
  | { status: 'error'; error: ExploreDomainError };
```

### Pure functions

```ts
function createExplorationState(): ExplorationSavedState;
function enterScene(
  saved: ExplorationSavedState,
  session: Omit<ExplorationSessionState, 'sceneId' | 'position'>,
  sceneId: string,
  spawn: SpawnResolution
): ExplorationSessionState;
function movePlayer(
  state: ExplorationSessionState,
  direction: 'up' | 'down' | 'left' | 'right'
): ExplorationSessionState;
function interactEntity(
  state: ExplorationSessionState,
  entityId: string
): { state: ExplorationSessionState; events: ExplorationEvent[] };
function exitScene(state: ExplorationSessionState, exitId: string): ExitSceneResult;
function nearbyEntities(state: ExplorationSessionState): EntityPlacement[];
function nearbyExits(state: ExplorationSessionState): ExitPlacement[];
```

### ExplorationEvent (emitted, not persisted)

```ts
type ExplorationEvent =
  | { type: 'scene.entered'; sceneId: string }
  | { type: 'world.interaction'; sceneId: string; entityId: string }
  | { type: 'npc.talked'; sceneId: string; npcId: string; entityId: string };
```

These map directly to the quest engine's structured contracts
(`go_to` → `scene.entered`, `interact` → `world.interaction`).

### Adapter interface

```ts
interface ExplorationPort {
  loadCollisionGrid(sceneId: string): Promise<ReadonlyArray<ReadonlyArray<boolean>>>;
  loadEntityPlacements(sceneId: string): Promise<EntityPlacement[]>;
  loadExitPlacements(sceneId: string): Promise<ExitPlacement[]>;
  loadSpawnPoint(sceneId: string, spawnPointId: string): Promise<{ x: number; y: number }>;
}
```

## Data contract (save integration)

`ExplorationSavedState` is included in the `SavePayload.domain` alongside
`DialogueSavedState` and `QuestSavedState`. The save system (WO-013) snapshots
it byte-identical; resume restores it.

```ts
// src/application/save/ports.ts addition
interface SaveDomain {
  dialogue: DialogueSavedState;
  quest: QuestSavedState;
  exploration: ExplorationSavedState;
}
```

## Acceptance criteria

| AC    | Description                                                                                                                                                                                     | Test                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| AC-01 | `movePlayer` validates against collision grid; blocked moves leave position unchanged                                                                                                           | `tests/unit/exploration/exploration-runtime.test.ts` |
| AC-02 | `interactEntity` checks Chebyshev distance ≤ interactionRange; out-of-range returns empty events                                                                                                | unit                                                 |
| AC-03 | `interactEntity` with an NPC emits `npc.talked` with correct npcId                                                                                                                              | unit                                                 |
| AC-04 | `interactEntity` with a non-NPC interactable emits `world.interaction`                                                                                                                          | unit                                                 |
| AC-05 | `exitScene` returns `ok` with the target scene id and empty events; unknown/out-of-range exits return a typed `ExploreDomainError` (`exit-not-found` / `exit-out-of-range`), never a bare throw | `tests/unit/exploration/exploration-runtime.test.ts` |
| AC-06 | `nearbyEntities` returns all entities within interaction range                                                                                                                                  | unit                                                 |
| AC-07 | `enterScene` with a `resolved` spawn places the player at the authored coordinate and marks the scene visited; an `unresolved` spawn yields `position === null` (never a fabricated `(0,0)`)    | unit                                                 |
| AC-08 | Full flow: move → interact NPC → events include `npc.talked` → dialogue can start                                                                                                               | `tests/integration/exploration-runtime.test.ts`      |
| AC-09 | Exploration state round-trips through serialization (save/load)                                                                                                                                 | `tests/unit/save/schema-v2.test.ts`                  |
| AC-10 | Deterministic: same inputs always produce same outputs (purity)                                                                                                                                 | unit                                                 |

## Non-goals (carried from spec)

- No Phaser rendering, tilemaps, sprites, camera, or animations.
- No pixel-level collision or physics.
- No input capture or keyboard handling.
- No NPC AI, pathfinding, or autonomous movement.
- No inventory, skills, relationships, or XP systems.
- No content pipeline changes for collision data.
- Save schema evolution is owned by WO-013/FS-SAVE-001; exploration joins the
  authoritative snapshot via schema v2 with a real v1→v2 migration that resumes
  the persisted `activeSceneId` (see `src/domain/save/migrations.ts`).
