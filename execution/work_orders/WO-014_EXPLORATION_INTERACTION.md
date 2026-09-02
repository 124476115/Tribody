# WO-014 — Exploration & Interaction

## Objective

Deliver the deterministic exploration **domain runtime** and its **save
integration** (schema v2), the final Gate-1 blocker. Phaser scene rendering /
input / interaction HUD are explicitly **OUT** of this WO (owning WO-030).

## Scope

### In

- Pure exploration domain: `src/domain/exploration/` (types + runtime, no
  Phaser/React/browser/zod).
- Abstract grid position `{ x, y }`; collision grid (2D boolean mask), entity &
  exit placements, interaction range.
- Domain functions: `createExplorationState`, `enterScene`, `movePlayer`,
  `interactEntity`, `exitScene`, `nearbyEntities`, `nearbyExits`,
  `chebyshevDistance`.
- Exploration events `scene.entered` / `world.interaction` / `npc.talked` map to
  the quest structured contracts (`go_to`, `interact`, `talk`).
- Save schema **v2**: `domain.exploration` in the authoritative snapshot, real
  v1→v2 migration (resume persisted `activeSceneId`), strict v2 guard.
- Unit + integration tests.

### Out

- Phaser rendering, tilemaps, sprites, camera, animations, input capture,
  interaction-prompt HUD (→ WO-030).
- Audio (→ WO-031). NPC AI / pathfinding.
- Inventory / skills / relationships / XP (→ Gate 2).
- Authored collision content (programmatic in WO-014).

## Design

### Architecture

Phaser emits an Intent (`GameCommand`); an application command reduces
exploration domain state; the reduced event (`npc.talked`, `world.interaction`,
`scene.entered`) is dispatched to the quest engine. No rule logic lives in a
Phaser scene.

### Domain model (`src/domain/exploration/`)

- `ExplorationSavedState { sceneId; position:{x,y}; visitedScenes[] }` —
  persisted, JSON-safe.
- `ExplorationSessionState` — transient: adds `collisionGrid`, `entities`,
  `exits`, `interactionRange`.
- Pure functions commit exactly one transition and leave prior state unchanged on
  rejection (blocked/malformed/out-of-range).

### Save integration (schema v2)

- `SAVE_SCHEMA_VERSION = 2`; `SavePayload.domain` gains `exploration`.
- v1→v2 migration (`src/domain/save/migrations.ts`) must not invent
  coordinates — it resumes the persisted `activeSceneId` at the legacy/default
  entry and marks it visited. Only v1-available data is used.
- v2 guard (`validatePayloadV2` + `validatePayload` dispatch) enforces
  `activeSceneId === exploration.sceneId` and structural validity; contradictory
  states are rejected (`corrupt-shape`), never silently chosen.
- Save-time now runs the version guard; default `SaveService` ships the
  production `Migrations` so legacy saves load through the v2 pipeline.

## Acceptance criteria → tests

| AC    | Description                                                                                                            | Test                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| AC-01 | blocked/out-of-bounds moves leave position unchanged                                                                   | `tests/unit/exploration/exploration-runtime.test.ts` |
| AC-02 | Chebyshev range check; out-of-range → no events                                                                        | unit above                                           |
| AC-03 | NPC interact emits `npc.talked` (correct npcId)                                                                        | unit above                                           |
| AC-04 | interactable emits `world.interaction`                                                                                 | unit above                                           |
| AC-05 | `exitScene` returns `ok` (target, empty events); unknown/out-of-range → typed `ExploreDomainError`, never a bare throw | unit above                                           |
| AC-06 | `nearbyEntities` filters by range                                                                                      | unit above                                           |
| AC-07 | `enterScene` resolved spawn → authored coordinate; unresolved → `position === null` (no fabricated `(0,0)`)            | unit above                                           |
| AC-08 | move → interact → `npc.talked` → quest commit → `dialogueStart`                                                        | `tests/integration/exploration-runtime.test.ts`      |
| AC-09 | exploration round-trips through save/load                                                                              | `tests/unit/save/schema-v2.test.ts`                  |
| AC-10 | determinism / purity                                                                                                   | unit above                                           |

## Implementation notes (WO-014)

- Exploration domain shipped as a pure module; 26 unit tests + 1 integration
  test cover AC-01..AC-10.
- **Spawn honesty**: `enterScene` takes an explicit `SpawnResolution`
  (`resolved` position | `unresolved` reason). The domain never fabricates
  `(0,0)` for an unresolved/unknown named spawn — `ExplorationSessionState.
position` is `null` while awaiting spawn resolution. Manifest-backed
  spawn-coordinate resolution is deferred to a later owning WO.
- **Typed exits**: `exitScene` returns `ExitSceneResult` (typed `ok` | error
  with `ExploreDomainError` code `exit-not-found` / `exit-out-of-range`),
  replacing bare `Error` throws. Follows the quest/dialogue `XxxDomainError`
  convention.
- Save schema bumped to v2 with real migration + strict v2 guard + dispatch
  (`validatePayload`). `migrations.test.ts` updated to expect `['2']` /
  `SAVE_SCHEMA_VERSION=2`.
- `saveToSlot` now runs `validatePayload(target, payload)` before content
  validation; `SaveService` defaults `migrations` to the production `Migrations`
  so normal construction loads legitimate v1 saves (retains injection for
  tests/custom composition).
- Domain-purity constraints enforced for exploration and events; `ReadonlyArray`
  lint rule requires `readonly T[]` (collision grid typed `readonly boolean[][]`).
- E2E move→interact→dialogue deferred to WO-030 (needs Phaser scene + input).
  The browser reload E2E (`tests/e2e/reload.spec.ts`) already exercises the
  save/load path through the dev harness.

## Gate

Gate 1 (skeletal) — APPROVED WITH REQUIRED FIXES addressed, pending final
maintainer approval to close. `npm run quality` and `test:e2e` (6/6) green.

### Verification evidence

- `npm run quality`: PASS (format, lint, typecheck, unit 276, integration 19,
  validate:content, build).
- `npm run test:e2e`: 6/6 PASS.
- Unit: 26 exploration + 8 save-schema-v2 tests; Integration: 1 exploration.

### Files changed

`src/domain/exploration/{types,runtime,index}.ts`, `src/domain/save/{types,
migrations,guards}.ts`, `src/application/save/{save-service,loadPipeline}.ts`,
`src/dev/harness.ts`, tests under `tests/unit/exploration/`,
`tests/integration/exploration-runtime.test.ts`, `tests/unit/save/schema-v2.test.ts`,
test fixtures and existing save test updates.

### Risks / debt

- Manifest-backed spawn-coordinate resolution (`SpawnResolution` given a real
  level/spawn table) is deferred to a later owning WO; until then a caller must
  supply a `resolved` position explicitly or accept the awaiting-spawn state.
- Phaser scene + input + HUD (WO-030) still required for a full exploration E2E.

### Next allowed Work Order

- WO-020 (Gate 1 completion / Gate 2 planning) — pending maintainer direction.
