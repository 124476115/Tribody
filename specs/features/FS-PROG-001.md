# FS-PROG-001 — Character Progression

## Status

**Approved** for WO-020 (Gate 2). Plan WO-020 approved with decisions. Pure
domain runtime + save schema v3 integration are in scope; skills/checks
(WO-021), relationships/medals/codex (WO-023), and React HUD (WO-030) are out.

## Problem

The game has no deterministic character progression. Level, XP, and attributes
do not exist as canonical state, so the quest engine (WO-012) and dialogue
engine (WO-011) have no persisted per-PC capability to gate on. XP must accrue
deterministically from facts already emitted by accepted Gate 1 systems, with a
hard one-shot-occurrence invariant so the same occurrence can never be re-farmed.

## Player value

The player experiences meaningful, measurable growth: levels, XP, and stable
attributes that persist across save/load and across chapters (per playable
character). Growth is deterministic and fair — there is no repeat-grinding of a
single occurrence for infinite XP.

## Scope

### In

- Pure progression domain: `src/domain/progression/` (no Phaser, React, Zod,
  browser, or Node.js built-ins).
- Levels 1–20 with a deterministic XP threshold curve.
- A fixed, curated attribute set (canonical domain state, consumed by WO-021).
- Per-chapter-PC independent progression keyed by a stable `pcId`.
- Archive meta-progression, structurally separate from PC progression.
- Level-up as a first-class domain event, produced by this system
  (`progression.level-up`). The event is registered in the generic WO-002 kernel
  registry; **quest-side consumption is deferred** (never wired into WO-012).
- Deterministic, idempotent XP accrual with a persisted per-occurrence dedup
  ledger (survives reload).
- Level-cap behavior at 20 (clamped) and multi-level grant semantics.
- Save schema v3 (`domain.progression`) + real v2→v3 migration + strict v3
  guard, with v1/v2 validators unchanged.
- Unit tests (`tests/unit/progression/`), integration test
  (`tests/integration/progression-runtime.test.ts`), save v3 tests
  (`tests/unit/save/schema-v3.test.ts`), and re-running the full save
  compatibility suite.

### Out (later WOs)

- Skills / trees / three-tier checks → WO-021 (consumes attribute values; does
  not redefine them).
- Inventory / equip / item effects → WO-022.
- Relationships / medals / codex / archive content counters → WO-023.
- React HUD / journal / character screens → WO-030 (progression E2E deferred to
  WO-030).
- Quest structuring consuming `progression.level-up` — deferred until a concrete
  quest/content requirement owns it.

## User flow

1. Gameplay first introduces/activates a PC → application calls
   `activatePc(state, pcId)`, creating canonical initial state (level 1, 0 XP,
   default attributes, empty ledger).
2. A Gate 1 fact (quest resolution, dialogue/exploration milestone) produces an
   XP source fact carrying a stable `occurrenceId`.
3. Application calls `applyXp(state, fact)`. The runtime credits XP iff the
   occurrence is not already in the PC's persisted ledger.
4. If thresholds are crossed, the runtime returns a deterministic sequence of
   `LevelUpResult`; the application emits one `progression.level-up` domain event
   per discrete level gained.
5. On save, the whole `ProgressionSavedState` persists in `domain.progression`
   (schema v3). On reload it round-trips byte-stable; the dedup ledger survives.

## Domain model

All contracts live in `src/domain/progression/` (pure TypeScript; depends only on
the events kernel type surface for emissions). Two structurally distinct states.

### `PcProgression` (persisted, per-PC, keyed by stable `pcId`)

```ts
type AttributeId = 'intellect' | 'perception' | 'will';

interface PcProgression {
  pcId: string;                    // stable identity; never display/localization text
  level: number;                   // MIN_LEVEL..MAX_LEVEL inclusive
  xp: number;                      // non-negative integer; capped at the level-20 threshold
  attributes: Record<AttributeId, number>; // canonical value state; fixed curated set
  creditedOccurrences: string[];   // persisted dedup ledger; survives reload
}
```

### `ArchiveMetaProgression` (persisted, structurally separate — never merged)

```ts
interface ArchiveMetaProgression {
  discoverableCount: number;       // non-negative integer
  lifetime: Record<string, number>; // spoiler-agnostic lifetime counters
}
```

### `ProgressionSavedState` (the persisted envelope for WO-013)

```ts
interface ProgressionSavedState {
  pcs: Record<string, PcProgression>; // keyed by stable pcId; empty until activation
  archive: ArchiveMetaProgression;
}
```

### Level curve (deterministic)

`xpRequiredToReach(level)` returns the XP needed to *reach* `level` from level 1:

```
xpRequiredToReach(1) = 0
xpRequiredToReach(n) = 100 * (n-1) * n / 2   for n >= 2
```

Level slot for a given XP: the highest level whose threshold is ≤ XP, clamped to
`MAX_LEVEL`. `MAX_XP = xpRequiredToReach(20) = 19000` is the XP cap (clamped at
level cap).

### `XpSourceFact` (the XP-award input contract)

```ts
interface XpSourceFact {
  pcId: string;        // which PC is being credited
  occurrenceId: string; // STABLE occurrence identity OWNED BY THE PRODUCER
  xp: number;          // positive integer amount
}
```

Dedup identity is `occurrenceId`, per PC ledger. Two distinct occurrences with
different `occurrenceId`s both award XP even if type/amount equal (AC-01/AC-06).
Re-crediting an already-credited `occurrenceId` awards zero XP. Because the
ledger is per-PC, the same `occurrenceId` may legitimately award XP to two
different PCs (per-PC independence).

## State machine / runtime functions

```ts
function createProgressionState(): ProgressionSavedState;
function activatePc(state: ProgressionSavedState, pcId: string): ProgressionSavedState;
function applyXp(state: ProgressionSavedState, fact: XpSourceFact): ApplyXpResult;
```

### `ApplyXpResult`

```ts
interface LevelUpResult {
  pcId: string;
  from: number; // the level BEFORE this discrete step
  to: number;   // from + 1
}

interface ApplyXpResult {
  state: ProgressionSavedState; // next state (immutable)
  levelUps: LevelUpResult[];    // deterministic per-step sequence; empty if none
  credited: boolean;            // false iff occurrence was already credited (dedup)
  grantedXp: number;            // 0 iff dedup
}
```

### Behavioral rules

- **Idempotent / one-shot (AC-01, AC-06):** repeating an already-credited
  `occurrenceId` returns `credited: false`, `grantedXp: 0`, no state change, no
  level-ups.
- **Multi-level (review decision):** a single award crossing multiple thresholds
  returns one `LevelUpResult` per discrete level gained, in ascending order, so
  the application emits a correct deterministic count/sequence of
  `progression.level-up` events.
- **Level cap (review decision — clamped):** at `MAX_LEVEL` (20), incoming XP is
  ignored (clamped to `MAX_XP`); the occurrence is still credited, but no
  level-up is emitted and `level` stays 20.
- **PC must be activated:** `applyXp` to a `pcId` with no entry is a typed
  `ProgressionError` (`pc-not-activated`), never a silent fabricate
  (consistent with the no-named-state-fabrication invariant). Callers call
  `activatePc` first.
- **Input validity:** non-positive or non-integer `xp` is a typed
  `ProgressionError` (`non-positive-xp`).
- **Monotonicity:** `xp` and `level` are non-decreasing across applications.
- **Archive separation:** `archive` is never touched by `applyXp`/`activatePc`;
  no XP/level reducer writes to it (AC-05).

### Level-up event (produced here; consumed later)

The application maps each `LevelUpResult` to a `progression.level-up` domain
event:

```ts
{ type: 'progression.level-up', pcId, from, to }
```

The type is registered in the generic WO-002 kernel registry (Gate-2 extension).
Quest-side consumption is OUT of scope (WO-012 untouched).

## Data contract (save integration — state-ownership)

`ProgressionSavedState` is canonical continuation state → it joins the
authoritative snapshot as `domain.progression`, requiring a **real schema v3**
bump. No derivative of other domains is stored here.

Contract steps:

1. `SAVE_SCHEMA_VERSION = 3`; `domain.progression: ProgressionSavedState`.
2. Real **v2→v3 migration** (sequential registry; `Migrations` gains step `3:`).
   A v2 snapshot legitimately has no progression history, so the migration seeds
   **canonical initial state**: `pcs: {}` (EMPTY map — no fabricated/derived PC
   list from the content catalog), `archive: { discoverableCount: 0, lifetime:
   {} }`. The migration is pure and **content-independent** — it never reads the
   catalog or derives XP/level from dialogue/quest/exploration data.
3. **Strict v3 guard** (`validatePayloadV3`) keeps v1/v2 validators byte-identical
   and adds progression field checks; `validatePayload` dispatches v3.
4. `SaveService` default already ships the production `Migrations` registry, so
   legacy v1/v2 saves chain automatically through v3.
5. Pipeline order + frozen checksum body unchanged.

**State-ownership rules held:**
- Progression owns its PC/archive shape; no other domain mutates it.
- Migration seeds initial state only (empty PCs, canonical archive) — nothing
  fabricated from existing Gate-1 data.
- Attribute values live here as raw numbers; skill checks (WO-021) consume them,
  they do not redefine them.
- Stable `pcId` is the persisted key; no display/localization text is used as a
  key.

## Error / failure modes

- `pc-not-activated`: `applyXp` to an unknown `pcId` (typed `ProgressionError`).
- `non-positive-xp`: `applyXp` with invalid `xp` (typed `ProgressionError`).
- Save-side failures continue using the existing SaveError taxonomy only; the
  progression domain itself returns typed results, never bare throws (mirrors
  WO-014).

## Save implications

- Schema v3 is a deliberate, single, justified bump (canonical continuation
  state). Adds `domain.progression`; the frozen checksum body and pipeline order
  are unchanged; only the migration registry/guard/dispatch grow.
- v1/v2 validators remain byte-for-byte unchanged.
- The XP dedup ledger is persisted so correctness survives reload (review
  decision).

## Accessibility

Progression is a structural domain concern; no presentational changes here.
Level/XP are shown later in WO-030; this WO adds no interface.

## Performance

Per-PC ledger is a string array of occurrence ids; negligible for realistic play
(no log-style unbounded growth — capped by authored content volume).

## Security / trust

No arbitrary JS in migration or runtime; `applyXp` is a pure function over typed
state and a typed fact. Migration never executes content-defined logic.

## Acceptance criteria

| AC    | Description                                                                                                        | Level |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ----- |
| AC-01 | XP accrual is deterministic and idempotent; an identical one-shot occurrence grants XP at most once                | unit  |
| AC-02 | Level-up emits a `progression.level-up` event carrying the new level (via LevelUpResult mapping)                   | unit  |
| AC-03 | XP/level transitions are monotonic and exact across thresholds (boundary: 0 XP, level 1, level 20)                 | unit  |
| AC-04 | Per-chapter-PC progression is independent (stable pcId key; same occurrence can credit different PCs)              | unit  |
| AC-05 | Archive meta-progression is distinct from PC progression and never merged                                          | unit  |
| AC-06 | No infinite XP from repeating the same one-shot occurrence                                                         | unit  |
| AC-07 | Progression state round-trips through save schema v3 (incl. v2→v3 migration)                                       | unit  |
| AC-08 | Chain: XP source fact → accrual → level-up event → (deferred) quest/visible effect                                 | integration |
| AC-09 | Level cap: at 20 XP is clamped; no level-up is emitted past the cap                                                | unit  |
| AC-10 | Multi-level: a single award crossing multiple thresholds emits the correct deterministic sequence/count of level-ups | unit  |
| AC-11 | Migration seeds canonical initial state (empty pcs map, canonical archive) and is content-independent               | unit  |

## Test plan

| AC    | Test type | Test |
| ----- | --------- | ---- |
| AC-01 | Unit      | `tests/unit/progression/runtime.test.ts` |
| AC-06 | Unit      | `tests/unit/progression/runtime.test.ts` |
| AC-03 | Unit      | `tests/unit/progression/boundaries.test.ts` |
| AC-09 | Unit      | `tests/unit/progression/boundaries.test.ts` |
| AC-10 | Unit      | `tests/unit/progression/multilevel.test.ts` |
| AC-04 | Unit      | `tests/unit/progression/independence.test.ts` |
| AC-05 | Unit      | `tests/unit/progression/archive.test.ts` |
| AC-02 | Unit      | `tests/unit/progression/event-emission.test.ts` |
| AC-07 | Unit      | `tests/unit/save/schema-v3.test.ts` |
| AC-11 | Unit      | `tests/unit/save/schema-v3.test.ts` / `tests/unit/save/migrations.test.ts` |
| AC-08 | Integration | `tests/integration/progression-runtime.test.ts` |
| —     | Unit (regression) | re-run full save suite (`tests/unit/save/**`, `tests/integration/save-roundtrip.test.ts`) |

## Implementation notes

- (WO-020 implementation complete)
- XP curve is a deterministic closed form (no randomness, no wall-clock).
- Runtime functions: `createProgressionState` / `activatePc` / `applyXp` live in
  `src/domain/progression/runtime.ts`; types + curve helpers in `types.ts`.
- Level-up: `applyXp` returns a deterministic `LevelUpResult[]`; the application
  maps each to a `progression.level-up` kernel event (`PROGRESSION_LEVEL_UP_EVENT_TYPE`).
- Save schema v3: `SAVE_SCHEMA_VERSION = 3`, `domain.progression`, real
  v2→v3 migration (`migrateV2ToV3` seeds empty `pcs` + canonical archive; pure &
  content-independent), strict `validatePayloadV3` (attribute whitelist, per-PC
  key identity, 1..20 level, non-negative XP), and `validatePayload` dispatch.
  v1/v2 validators unchanged. Full save compatibility suite re-run and green.
- `SaveDomain` / `loadPipeline.runtime` now include `progression`; harness and
  `tests/helpers/save-fixtures.ts` gain canonical `createProgressionState()`.

## Open questions

- None blocking. WO-021 will define how attribute values feed skill checks (out
  of WO-020 scope).

## Revision history

- Rev 0: initial spec after WO-020 plan approval (maintainer decisions:
  level-up event allowed with deferred quest consumption; fixed curated attribute
  set; empty-pcs migration; clamped level cap; multi-level sequence; persisted
  dedup ledger).
