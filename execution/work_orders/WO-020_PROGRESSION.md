# WO-020 — Character Progression

## Status

**IMPLEMENTED.** Plan review approved with decisions (level-up event allowed,
quest consumption deferred; fixed curated attribute set; empty `pcs` migration;
clamped level cap; multi-level emission sequence; persisted dedup ledger). See
FS-PROG-001 for the traced spec.

## Implementation Notes (WO-020)

- Feature spec: `specs/features/FS-PROG-001.md`.
- Domain: `src/domain/progression/{types,runtime,index}.ts` — levels 1–20,
  deterministic quadratic XP curve, fixed attributes
  (`intellect`/`perception`/`will`, canonical initial values), per-PC state
  keyed by stable `pcId`, structurally separate archive meta-progression,
  `activatePc` / `applyXp`, one-shot occurrence ledger (persisted), clamped
  level cap, and a deterministic per-step `LevelUpResult[]` for multi-level
  grants. `applyXp` never fabricates a PC (typed `pc-not-activated`); invalid XP
  is `non-positive-xp`.
- Event: `progression.level-up` produced (type constant
  `PROGRESSION_LEVEL_UP_EVENT_TYPE`); registered in the generic WO-002 kernel
  registry at the call site. Quest-side consumption deliberately NOT wired into
  WO-012 (per review decision).
- Save schema v3: `SAVE_SCHEMA_VERSION = 3`, `domain.progression`, real
  v2→v3 migration (seed: empty `pcs`, canonical archive; pure + content-
  independent), strict `validatePayloadV3`, `validatePayload` dispatch. v1/v2
  validators unchanged.
- Wiring: `SaveDomain` + `loadPipeline.runtime` include `progression`; dev
  harness and save test fixtures supply `createProgressionState()`.
- Tests: 8 unit files in `tests/unit/progression/` (30 cases), integration
  `tests/integration/progression-runtime.test.ts`, `tests/unit/save/schema-v3.test.ts`;
  updated `schema-v2.test.ts`, `migrations.test.ts`, and the full save
  compatibility suite. `npm run quality` and `npm run test:e2e` (6/6) pass.

## Objective

Introduce deterministic character progression: level, XP thresholds, and
attributes, per chapter player character (PC), with archive meta-progression kept
separate. Level-up is a first-class domain event. No infinite repeat XP from an
identical one-shot occurrence.

## Scope

### In

- Pure progression domain: `src/domain/progression/` (types + runtime, no
  Phaser/React/browser).
- Level 1–20, XP curve / thresholds, attributes.
- Per-chapter-PC independent progression state.
- Archive meta-progression state, kept separate from PC progression.
- Level-up as a domain event; emit into the kernel.
- Deterministic, idempotent XP accrual with the one-shot-occurrence guard.
- Save schema v3 integration (`domain.progression`) + v2→v3 migration + strict
  guard.
- Unit + integration tests, plus boundary-level tests (level 1, 20, exact-threshold).

### Out (later own WORs)

- Skills / trees / three-tier checks → WO-021.
- Inventory / equip / item effects → WO-022.
- Relationships / medals / codex → WO-023.
- React HUD / journal / character screens → WO-030.

## Acceptance criteria (draft)

| AC | Description | Level |
|----|-------------|-------|
| AC-01 | XP accrual is deterministic and idempotent; an identical one-shot occurrence grants XP at most once | unit |
| AC-02 | Level-up emits a `progression/level-up` domain event carrying the new level | unit |
| AC-03 | XP/level transitions are monotonic and exact across thresholds (boundary: 0 XP, level 1, level 20) | unit |
| AC-04 | Per-chapter-PC progression is independent | unit |
| AC-05 | Archive meta-progression is distinct from PC progression and never merged | unit |
| AC-06 | No infinite XP from repeating the same one-shot occurrence | unit |
| AC-07 | Progression state round-trips through save schema v3 (incl. v2→v3 migration) | unit |
| AC-08 | Chain: XP source event → accrual → level-up event → quest/then-visible effect | integration |

## Design

### Domain model (`src/domain/progression/`)

```ts
interface PcProgression {
  pcId: string;
  level: number; // 1..20
  xp: number;
  attributes: Record<AttributeId, number>;
  // per-occurrence dedup ledger; keys are source EventId buckets
  creditedOccurrences: string[];
}

// archive meta-progression: intentionally a DIFFERENT type, never merged above
interface ArchiveMetaProgression {
  discoverableCount: number;
  // spoiler-agnostic lifetime counters (codesx/medal-owned data lives in WO-023)
  lifetime: Record<string, number>;
}

interface ProgressionSavedState {
  pcs: Record<string, PcProgression>; // keyed by stable pcId
  archive: ArchiveMetaProgression;
}
```

### XP sources (WO-020 only)

Progress from fact sources ALREADY emitted by accepted Gate 1 systems — no
dependency on WO-021/022/023 internals:

- quest resolution (quest resolved_success)
- dialogue/exploration milestone events
- any system may add future XP-emitting facts; WO-020 consumes a fixed,
  deterministic set for now.

The one-shot guard dedupes by a stable occurrence identity (creditedOccurrences
record / event-id bucket); repeating an already-credited occurrence yields zero
additional XP (AC-06).

### Level-up as a domain event

`ProgressionRuntime.applyXp(state, sourceFact)` returns `{ levelUp?: {pcId,
from, to} }`; the application emits a `progression/level-up` kernel event. WO-002
kernel already supports arbitrary registered event types (extend the registry);
the quest engine's structured-contract set (WO-012) would gain a canonical entry
(for example `level` → `progression.level-up`, `scopeField: 'pcId'`) — this is a
**cross-system contract change to a closed Gate 1 WO (WO-012) and must be
approved as a deliberate, narrowly-scoped extension**, not silently added.

## Cross-system boundaries

- **Event kernel (WO-002, closed)**: extend the registered event-type set with
  `progression.level-up`. Kernel surface already generic; registry addition only.
- **Quest engine (WO-012, closed)**: optional structured contract for level-up —
  needs explicit maintainer sign-off (see above). No change to existing
  talk/go_to/interact contracts.
- **Command boundary (WO-002 `GameCommand`)**: `skill/learn` already declared but
  NOT implemented here (owned by WO-021).
- **Save (WO-013, closed)**: new schema, see below.

## Data contract / Save schema v3 (state-ownership risk — primary review lens)

`SaveDomain` is currently **frozen at schema v2** = `{ dialogue, quest,
exploration }` with a strict v2 guard. Progression is canonical continuation
state → it must join the authoritative snapshot, requiring **schema v3**:

1. `SAVE_SCHEMA_VERSION = 3`; `domain.progression: ProgressionSavedState`.
2. Real **v2→v3 migration** (append-only, sequential registry). Because a v2
   snapshot legitimately has no progression history, the migration seeds a
   **deterministic initial state**: every known PC at level 1, zero XP, default
   attributes — an *initial state*, explicitly distinct from the spawn
   fabrication principle (no invented progression history from existing data).
3. **Strict v3 guard** + `validatePayload` dispatch extended (v1→validate v1;
   v2→validate v2; v3→validate v3).
4. `SaveService` default already ships the production `Migrations` registry
   (WO-014 acceptance) — v2→v3 steps in automatically; legacy v1/v2 saves still
   load, now through v3.
5. Pipeline order + checksum body unchanged; only the registry/migration/guard
   grow.

**State-ownership rules to hold:**
- Progression owns its PCM/archive shape entirely; no other domain mutates it.
- Migration seeds initial state only — never derives XP/level from dialogue/quest
  data (that would fabricate progression history).
- Attribute/skill *values* live here as raw numbers; *skill checks* (WO-021)
  consume them, they do not redefine them.

## Verification

- `npm run quality`
- `npm run test:e2e` (unchanged 6/6 expected; new progression E2E deferred until
  WO-030 exposes it in UI, unless a kernel-level browser path exists)
- New `tests/unit/progression/`, `tests/integration/progression-runtime.test.ts`,
  `tests/unit/save/schema-v3.test.ts`.

## Open questions for maintainer (before implementation)

1. **Level-up → quest structured contract**: OK to add a `progression.level-up`
   structured entry to WO-012's contract set (scoped, non-breaking), or should
   WO-020 defer any quest consumption of level-up to a later WO?
2. **Attribute set**: fixed curated set now (e.g. intellect/perception/will/etc.),
   or dynamic authoring-driven later? Fixed list is safer for the v3 schema.
3. **PC identity source**: where do stable `pcId`s come from (chapter manifests /
   content catalog owned by WO-010) — confirm the source so the v3 migration can
   enumerate known PCs deterministically, or whether migration seeds an empty
   `pcs` map and PCs are introduced on first play (preferred: seed empty, no
   fabricated PC list).

## Risks / debt

- Schema v3 reopening the save contract is the largest cross-Gate-1 touch; it is
  the correct seam (progression is canonical state) but must be reviewed as such.
- Adding a structured contract to a closed WO-012 is a forward-compat extension;
  gated on maintainer approval.
- XP source set is intentionally small for WO-020; expanding sources later must
  preserve the one-shot guard invariant (reducers stay deterministic/idempotent).

## Next

- After this plan is approved: (1) write FS-PROG-001 feature spec (currently a
  placeholder in the traceability matrix), (2) red tests, (3) implement, (4)
  schema v3 migration, (5) `npm run quality` + `test:e2e`, (6) update matrix +
  docs.
