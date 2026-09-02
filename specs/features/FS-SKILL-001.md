# FS-SKILL-001 — Skills & Checks

## Status

**Approved** for WO-021 (Gate 2). Plan WO-021 approved with decisions after three
review rounds (contracts frozen in Rev 2/Rev 3). Pure domain runtime + save
schema v4 + canonical 20-skill catalog + application coordinator are in scope;
React skill screen (WO-030), learned-skill-driven new UI affordances (WO-030),
relationships/medals/codex (WO-023), and quest-side consumption of skills are
out.

## Problem

The game has no deterministic skills or checks. Attributes exist (WO-020) but
there is no canonical skill state and no principled way to turn a dialogue skill
check into a repeatable, reload-stable outcome. Relying on non-deterministic
chance for mandatory story facts is forbidden (design invariant): failure must be
a branch with consequence, never a permanently lost mandatory story fact.
Without a central check contract, thresholds would be scattered invisible
difficulty in content (balance-guide violation).

## Player value

The player sees a stable, fair, three-tier outcome for their choices: clear
success, costly success, or failure with consequence. Outcomes are identical
across save/load because they derive from the player's persisted canonical state
plus a deterministic identity-seeded roll — no reload scumming, no arbitrary
difficulty hidden in content. Learning a skill permanently unlocks that
capability per character.

## Scope

### In

- Pure skills domain: `src/domain/skills/` (no Phaser, React, Zod, browser, or
  Node.js built-ins).
- A canonical catalog of **exactly 5 trees × 4 skills = 20 skills**, each with
  exactly one primary attribute (`intellect`/`perception`/`will`, the WO-020
  fixed curated set). The catalog is domain-owned; content declares trees but
  cannot redefine the primary-attribute mapping.
- **Learn-only** skill acquisition (no points budget, no unlearn, no ranks in
  this WO): `learnSkill(pcId, skillId, occurrenceId)` pivots a value `0 → 1`,
  with a persisted per-PC dedup ledger that survives reload.
- Three-tier deterministic check: `failed` / `costly` / `clear`.
- Deterministic **RollV1** (identity-seeded FNV-1a + rejection sampling), frozen
  algorithm with golden vectors (incl. a genuine retry-path case).
- Freeze on distribution: `0 <= roll < die` (die default 20), counters expanded
  as `seed + "#" + attempt` for attempt 0, 1, 2, … with FNV-1a anchors.
- Roll identity = `dialogueId#instanceOrdinal#nodeId#choiceId#skillId`; the same
  check identity always rolls the same number, across reloads, with **zero extra
  archive growth**; injectable for tests.
- Check score = `attribute + skill + evidenceBonus + relationshipBonus +
  situationalModifier`; bonuses are **numeric inputs only** (default 0, not
  Skills-owned state).
- **Current-state-at-resolution** semantics: a pending check is resolved against
  the canonical state at the moment it is resolved, not when it was parked.
- Central `DifficultyConfig` (`die`, `clearMargin`, default constant) instead of
  invisible per-content difficulty.
- Application coordinator (orchestration only) exposing the original
  `failed|costly|clear` tier; **only** the dialogue edge maps
  `clear/costly → passed`, `failed → failed`.
- Save schema v4 (`domain.skills`) + real v3→v4 migration + strict v4 guard,
  with v1/v2/v3 validators unchanged; v4 validates persisted skill keys against
  the canonical 20-skill set and values exactly `0 | 1`.
- `SkillManifest.tree` tightened to the 5 canonical trees; all authored content
  migrated in the same WO; content validation stays green.
- Unit tests (`tests/unit/skills/`), schema v4 tests
  (`tests/unit/save/schema-v4.test.ts`), content catalog tests, integration test
  (`tests/integration/skills-runtime.test.ts`), and re-running the full save
  compatibility suite.

### Out (later WOs)

- Skill ranks / points budget / respec / spend UI → deferred (values stay `0|1`
  in this WO; the guard enforces exactly that).
- Relationships/medals/codex → WO-023 (relationship bonus is a numeric input
  only here; no relationship state is created).
- Evidence/mission-board bonus bookkeeping → WO-022/deferred (evidenceBonus is a
  numeric input only).
- Chapter-entities DifficultyConfig wiring → WO-024/WO-030 (only a default
  constant + an injected override hook ship now).
- React/UI skill screen → WO-030.
- Quest rules or scenes that *require* a specific skill level → later, once
  content needs exist (`skill_at_least` condition already exists type-side).

## User flow

1. Gameplay awards a learn grant (a dialogue choice, quest reward, exploration
   milestone) carrying a **stable occurrenceId** produced by the content.
2. Application calls `learnSkill(state, { pcId, skillId, occurrenceId })`. The
   runtime pivots the skill value to 1 iff this `occurrenceId+skillId` pair is
   not already credited for that PC.
3. A dialogue choice with `skillCheck` parks the dialogue session in
   `awaitingSkillCheck`.
4. Application calls the checks coordinator, which reads **current** canonical
   state (attribute values from progression, skill value from skills) + the
   authored threshold/bonuses, resolves the deterministic roll, computes the
   three-tier result, and hands the binary intent to the dialogue edge.
5. Dialogue resumes with `passed` (clear/costly) or `failed` (failure) and
   applies the authored consequence. Success may grant more context; failure
   never permanently removes a mandatory story fact by design.
6. On save, `SkillsSavedState` persists in `domain.skills` (schema v4). On
   reload it round-trips byte-stable; ledger and skill values survive.

## Domain model

All contracts live in `src/domain/skills/` (pure TypeScript; depends only on
`src/domain/progression`'s `AttributeId`). The persisted envelope `SkillsSavedState`
is canonical continuation state and joins the authoritative snapshot as
`domain.skills` (schema v4).

### Canonical skill catalog

```ts
const SKILL_TREES = ['investigator', 'scientist', 'operator', 'strategist', 'humanist'] as const;
type SkillTreeId = (typeof SKILL_TREES)[number];
type AttributeId = 'intellect' | 'perception' | 'will'; // from WO-020

const CANONICAL_SKILLS = {
  skill_investigator_pattern_recognition:    { tree: 'investigator', primaryAttribute: 'perception' },
  skill_investigator_interview:              { tree: 'investigator', primaryAttribute: 'perception' },
  skill_investigator_surveillance_awareness: { tree: 'investigator', primaryAttribute: 'perception' },
  skill_investigator_evidence_reconstruction:{ tree: 'investigator', primaryAttribute: 'intellect'  },
  skill_scientist_experimental_design:       { tree: 'scientist',    primaryAttribute: 'intellect'  },
  skill_scientist_signal_analysis:           { tree: 'scientist',    primaryAttribute: 'perception' },
  skill_scientist_model_testing:             { tree: 'scientist',    primaryAttribute: 'intellect'  },
  skill_scientist_cosmology_literacy:        { tree: 'scientist',    primaryAttribute: 'intellect'  },
  skill_operator_repair:                     { tree: 'operator',     primaryAttribute: 'intellect'  },
  skill_operator_emergency_response:         { tree: 'operator',     primaryAttribute: 'will'      },
  skill_operator_eva:                        { tree: 'operator',     primaryAttribute: 'will'      },
  skill_operator_navigation:                 { tree: 'operator',     primaryAttribute: 'perception' },
  skill_strategist_risk_analysis:            { tree: 'strategist',   primaryAttribute: 'intellect'  },
  skill_strategist_resource_command:         { tree: 'strategist',   primaryAttribute: 'will'      },
  skill_strategist_deception_detection:      { tree: 'strategist',   primaryAttribute: 'perception' },
  skill_strategist_long_horizon:             { tree: 'strategist',   primaryAttribute: 'intellect'  },
  skill_humanist_de_escalation:              { tree: 'humanist',     primaryAttribute: 'will'      },
  skill_humanist_empathy:                    { tree: 'humanist',     primaryAttribute: 'perception' },
  skill_humanist_cultural_memory:            { tree: 'humanist',     primaryAttribute: 'intellect'  },
  skill_humanist_group_cohesion:             { tree: 'humanist',     primaryAttribute: 'will'      },
} as const satisfies Record<string, { tree: SkillTreeId; primaryAttribute: AttributeId }>;
```

Invariants (test-locked): exactly 5 trees; exactly 4 skills per tree; 20 unique
`skillId`s; every skill maps to exactly one primary attribute drawn from
`intellect|perception|will`; the content catalog cannot redefine the mapping.

### `PcSkills` and `SkillsSavedState` (persisted)

```ts
interface PcSkills {
  pcId: string;                        // stable identity; equals its map key
  values: Record<SkillId, 0 | 1>;      // canonical skill keys ONLY; exactly 0|1
  learnLedger: string[];               // entries `${occurrenceId}::${skillId}`
}

interface SkillsSavedState {
  pcs: Record<string, PcSkills>;       // keyed by stable pcId; empty until a learn
}
```

Ledger format decision: dedup is per `(occurrenceId, skillId)`, so a single
occurrence may legitimately grant different skills; replay credits nothing.

## State machine / runtime functions

```ts
function createSkillsState(): SkillsSavedState;
function learnSkill(state: SkillsSavedState, fact: LearnSkillFact): LearnSkillResult;
function skillValue(state: SkillsSavedState, pcId: string, skillId: SkillId): 0 | 1;
function resolveSkillCheck(input: SkillCheckInput): SkillCheckResult;
```

### `LearnSkillFact`

```ts
interface LearnSkillFact {
  pcId: string;        // which PC
  skillId: SkillId;    // canonical skill identity
  occurrenceId: string; // STABLE occurrence identity OWNED BY THE PRODUCER
}
```

### `LearnSkillResult`

```ts
type LearnSubjectOutcome = 'learned' | 'duplicate' | 'already-learned';

interface LearnSkillResult {
  state: SkillsSavedState;  // next immutable state
  outcome: LearnSubjectOutcome;
}
```

Behavioral rules:

- **learn-only (AC-01):** the only mutation is `values[skill] 0 → 1`. No unlearn,
  no ranks, no points budget. A PC with no entry is activated implicitly only by
  actually learning (no fabricated empty PC records).
- **Dedup / idempotent (AC-02):** replaying the same `occurrenceId::skillId`
  pair returns `outcome: 'duplicate'`, unchanged state, no mutation.
- **Already-learned (AC-03):** learning a skill the PC already owns from a
  *different* occurrence returns `outcome: 'already-learned'`, unchanged state —
  deterministic, never a silent re-credit.
- **Typed errors (AC-04):** unknown `skillId` → `SkillsError('unknown-skill')`;
  otherwise the domain treats the PC key as a fresh implicit activation. (Mirrors
  WO-020's posture: no fabricated state; a PC record appears only when a learn
  commits — same spirit as progression but learned skills create PCs
  unconditionally, i.e. learning is the activation trigger.) Whichever posture is
  chosen, it is locked by a test; no silent fabricate of unrelated shape.

### RollV1 (frozen — DO NOT change without a gold-vector migration)

```ts
function fnv1a32(text: string): number;
// FNV-1a 32-bit over UTF-8/ASCII code units; anchors: fnv1a32('') === 0x811c9dc5,
// fnv1a32('a') === 0xe40c292c.

function rollV1(seed: string, die: number): { roll: number; attempts: number };
```

- `limit = 2**32 - (2**32 mod die)`; accept the lowest `h` with `h < limit`,
  trying `seed + '#' + attempt` for attempt `0, 1, 2, …` (rejection sampling).
- Result distribution: `0 <= roll < die` (integer). Die default 20.
- **Golden vectors (Rev 3, test-locked):**

| seed pattern (identity)                  | die | roll | attempts |
| ---------------------------------------- | --- | ---: | -------: |
| `dlg_sample_conversation#1#n03#c_skill#skill_scientist_experimental_design` | 20 | 3  | 0 |
| `dlg_sample_conversation#2#n03#c_skill#skill_scientist_experimental_design` | 20 | 10 | 0 |
| `dlg_ch04_signal#1#n05#c_scan#skill_scientist_signal_analysis`             | 20 | 11 | 0 |
| `dlg_ch04_crew#1#n02#c_comfort#skill_humanist_empathy`                     | 20 | 18 | 0 |
| `chase_seed_019` (crafted large die)     | 0x90000000 | 2191426141 | 20 |
| `dlg_sc_test#1#n01#c_skill#skill_strategist_risk_analysis_diebig` (crafted) | 0x90000000 | 2027315711 | 10 |

The last two cases genuinely execute the rejection/retry path (limit
`0x90000000`, tail `0x70000000`; one rejects attempts 0–19 then accepts 20, the
other rejects 0–9 then accepts 10). The crafted die exists only for gold-vector
coverage of the retry branch; game checks use die 20.

- `fnv1a32` anchors are the two published constants above; the implementation
  may hash the ASCII code units of the seed (identities are program-constructed
  ASCII, so byte-fidelity is fixed).

### Check resolution

```ts
type CheckTier = 'failed' | 'costly' | 'clear';

interface SkillCheckSeed {
  dialogueId: string;
  instanceOrdinal: number;
  nodeId: string;
  choiceId: string;
  skillId: SkillId;
}

interface SkillCheckInput {
  skillId: SkillId;
  attributeValue: number;      // the skill's PRIMARY attribute, current at resolution
  skillValue: 0 | 1;           // canonical skill state, current at resolution
  threshold: number;           // authored per-check threshold (content)
  evidenceBonus: number;       // numeric input only; default 0
  relationshipBonus: number;   // numeric input only; default 0
  situationalModifier: number; // numeric input only; default 0
  die: number;                 // default DEFAULT_DIE (20)
  clearMargin: number;         // from DifficultyConfig; default DEFAULT_CLEAR_MARGIN (3)
  seed: SkillCheckSeed;
}

interface SkillCheckResult {
  tier: CheckTier;
  roll: number;          // deterministic 0 .. die-1
  attempts: number;      // retry count observed (0 for normal checks)
  score: number;         // attribute + skill + bonuses + modifier
  result: number;        // score + roll
}
```

- Roll seed = `dialogueId + '#' + instanceOrdinal + '#' + nodeId + '#' +
  choiceId + '#' + skillId` (the exact identity contract).
- **Bands (AC-09):** `result < threshold` → `failed`;
  `threshold <= result < threshold + clearMargin` → `costly`;
  `result >= threshold + clearMargin` → `clear`. Exact boundary values are pinned
  by tests (equality at `threshold` is `costly`; equality at
  `threshold + clearMargin` is `clear`).
- **Score (AC-08):** `score = attributeValue + skillValue + evidenceBonus +
  relationshipBonus + situationalModifier`. Pure integer arithmetic; bonuses are
  numeric inputs only, never Skills-owned state.
- **Current-state-at-resolution (AC-11):** same seed + same current state ⇒ same
  tier; changing the PC's attributes or skill value between parking and
  resolution changes the outcome deterministically (a reload that raised an
  attribute can rescue a parked check).

### DifficultyConfig (central, not per-content)

```ts
interface DifficultyConfig {
  die: number;        // default 20
  clearMargin: number;// default 3
}
export const DEFAULT_DIFFICULTY_CONFIG: DifficultyConfig = { die: 20, clearMargin: 3 };
```

Balance guide's four tiers (Routine/Trained/Expert/Exceptional) map to per-chapter
config **later**; today one canonical default + an injected override handle in
the coordinator. No invisible arbitrary difficulty lives in content.

### Coordinator (application, orchestration only)

```ts
// src/application/checks/coordinator.ts
interface ResolvePendingCheckDeps {
  state: { dialogue: DialogueSavedState; progression: ProgressionSavedState; skills: SkillsSavedState };
  contentLookup: (dialogId: string, nodeId: string, choiceId: string) => SkillCheck | null;
  config?: DifficultyConfig; // default DEFAULT_DIFFICULTY_CONFIG
}
interface ResolvePendingCheckOutcome {
  tier: 'failed' | 'costly' | 'clear';
  roll: number; attempts: number;
  score: number; result: number;
  dialogueOutcome: 'passed' | 'failed'; // the ONLY mapping: clear/costly→passed, failed→failed
}
```

The coordinator **only** reads (current dialogue pending check + current
progression attributes + current skills), computes the deterministic check, and
returns the original tier plus the binary `dialogueOutcome`. It does not mutate
dialogue and does not own state; the caller passes `dialogueOutcome` to the
existing WO-011 `dialogueResolveSkillCheck` intent (unchanged binary contract).
The full three-tier signal stays observable by the caller for HUD/logging.

## Data contract (save integration — state-ownership)

`SkillsSavedState` is canonical continuation state → it joins the authoritative
snapshot as `domain.skills`, requiring a **real schema v4** bump.

Contract steps:

1. `SAVE_SCHEMA_VERSION = 4`; `domain.skills: SkillsSavedState`.
2. Real **v3→v4 migration** (sequential registry; `Migrations` gains step `4:`).
   A v3 snapshot legitimately has no skills, so the migration seeds canonical
   initial state: `skills: { pcs: {} }`. It is **pure and content-independent** –
   never reads the catalog, never derives skill state from other domains.
3. **Strict v4 guard** (`validatePayloadV4`) keeps v1/v2/v3 validators
   byte-identical and adds skills checks. The guard validates persisted skill
   keys against the **canonical 20-skill domain set** (rejects invented keys such
   as `skill_science_unknown` — the canonical set, not merely the id prefix, is
   available to the guard without any content import), values exactly `0|1`, the
   `pcId` key identity, and the ledger shape (string array).
4. `validatePayload` dispatches v4. `loadPipeline`/`SaveDomain`/`runtime` gain
   `skills`; harness and `tests/helpers/save-fixtures.ts` seed
   `createSkillsState()`.
5. Pipeline order + frozen checksum body unchanged.

**State-ownership rules held:**
- Skills owns skill values + learn ledger only; **progression owns attributes**
  (checks read attribute values, they do not store or redefine them).
- Bonuses are numeric inputs owned by callers/content, never persisted Skills
  state (no placeholder relationship/evidence state created).
- Migration seeds initial state only (empty `pcs`), nothing fabricated.

## Content contract

- `SkillManifest.tree` is tightened to `SKILL_TREES` (5 values). Existing authored
  skill content uses `tree: scientist` (already valid) and is migrated in this WO.
- 20 canonical `content/skills/*.yaml` documents (one per skill, `id`, `tree`,
  `nameKey`, `descriptionKey`) + corresponding zh-CN localization keys.
- Content catalog completeness tests assert: exactly 5 trees, exactly 4 skills
  per tree, 20 unique ids, ids match the domain canonical set, and content cannot
  redefine primary-attribute ownership.
- `skill_at_least` / `skillCheck.skillId` / `objective.skillIds` reference
  integrity stays green against the catalog (existing pipeline unchanged).

## Error / failure modes

- `unknown-skill`: `learnSkill`/`skillValue`/`resolveSkillCheck` with a skillId
  outside the canonical set (typed `SkillsError`).
- Dedup signal is a typed *outcome* (`duplicate`/`already-learned`), not a throw.
- Save-side failures continue using the existing `SaveError` taxonomy only
  (v4 guard rejects non-canonical keys / non-`0|1` values as `corrupt-shape`).

## Save implications

- Schema v4 is a deliberate, single, justified bump (canonical continuation
  state). Adds `domain.skills`; frozen checksum body, pipeline order, and
  v1/v2/v3 validators unchanged; only migration registry/guard/dispatch grow.
- Zero rolling state stored beyond ledger entries — no per-check RNG logs; the
  roll is recomputed deterministically on every resolution of a parked check.

## Accessibility

Structural domain concern; no presentational changes. The three-tier outcome is
designed to be observable for choice-results UI in WO-030 (coordinator already
exposes the original tier), without forcing timed inputs.

## Performance

- Roll is O(1)-expected (rejection probability `(2**32 mod die)/2**32`; for
  die=20 = 16/2**32 ≈ 3.7e-9, so retries are astronomically rare in real saves).
- Ledger grows one string per learn grant (bounded by authored content volume),
  exactly like WO-020's XP ledger.

## Security / trust

No arbitrary JS in migration or runtime; `learnSkill`/`resolveSkillCheck` are pure
functions over typed state and typed inputs. Migration never executes
content-defined logic; the v4 guard's canonical-set check is content-independent
(no catalog import at save time).

## Acceptance criteria

| AC    | Description                                                                                                | Level |
| ----- | --------------------------------------------------------------------------------------------------------- | ----- |
| AC-01 | Skill acquisition is learn-only: value pivots exactly 0→1, never any other value                           | unit  |
| AC-02 | Replaying the same `occurrenceId::skillId` is idempotent (`duplicate`, no change) and survives reload      | unit  |
| AC-03 | Learning an already-owned skill from a different occurrence is deterministic `already-learned` (no change) | unit  |
| AC-04 | Unknown skill ids produce typed `unknown-skill` errors across all entry points                             | unit  |
| AC-05 | Skills state round-trips through save schema v4 (incl. v3→v4 migration; other domains preserved)          | unit  |
| AC-06 | v4 guard rejects invented skill keys and values outside exactly `0|1`; pcId key identity + ledger shape    | unit  |
| AC-07 | RollV1 is deterministic: same seed ⇒ same roll; different seed/die independent; `0 <= roll < die`          | unit  |
| AC-08 | Golden vectors (incl. genuine rejection/retry path) are frozen; FNV-1a anchors hold                        | unit  |
| AC-09 | Three-tier bands are exact (failed < threshold ≤ costly < threshold+clearMargin ≤ clear)                   | unit  |
| AC-10 | Score is exactly attribute + skill + evidenceBonus + relationshipBonus + situationalModifier               | unit  |
| AC-11 | Resolution uses current canonical state (attributes/skill at resolution time), deterministic per identical state | unit  |
| AC-12 | Coordinator exposes the original tier and maps clear/costly→passed, failed→failed to the dialogue edge     | integration |
| AC-13 | Canonical catalog completeness/uniqueness (5 trees, 20 skills, one primary attribute each); tree enum tighten is content-valid | unit/integration |

## Test plan

| AC    | Test type | Test |
| ----- | --------- | ---- |
| AC-01 | Unit      | `tests/unit/skills/learn.test.ts` |
| AC-02 | Unit      | `tests/unit/skills/learn.test.ts` |
| AC-03 | Unit      | `tests/unit/skills/learn.test.ts` |
| AC-04 | Unit      | `tests/unit/skills/learn.test.ts` / `tests/unit/skills/roll.test.ts` |
| AC-07 | Unit      | `tests/unit/skills/roll.test.ts` |
| AC-08 | Unit      | `tests/unit/skills/roll.test.ts` |
| AC-09 | Unit      | `tests/unit/skills/check.test.ts` |
| AC-10 | Unit      | `tests/unit/skills/check.test.ts` |
| AC-11 | Unit      | `tests/unit/skills/check.test.ts` |
| AC-12 | Integration | `tests/integration/skills-runtime.test.ts` |
| AC-13 | Unit      | `tests/unit/skills/catalog.test.ts` (20-skill uniqueness/completeness + attribute map), content tests for tree enum |
| AC-05/AC-06 | Unit | `tests/unit/save/schema-v4.test.ts` / `tests/unit/save/migrations.test.ts` |
| —     | Unit (regression) | re-run full save suite (`tests/unit/save/**`, `tests/integration/save-roundtrip.test.ts`) |

## Implementation notes

- (WO-021 implementation complete — 2026-09-02)
- Domain: `src/domain/skills/{types,catalog,roll,runtime,index}.ts`.
- Roll is pure FNV-1a32 + rejection sampling; game checks use die 20, crafted
  large die only for retry-path gold vectors.
- Save schema v4: migration is `migrateV3ToV4` (seeds `{ pcs: {} }`), guard is
  `validatePayloadV4` (canonical-key membership from the domain catalog — import
  only the pure constant, no content pipeline), dispatch in `validatePayload`.
- `SaveDomain`/`loadPipeline.runtime`/harness/fixtures add `skills`.
- `SkillManifest.tree` tightened; 20 content skills + zh-CN localization.
- Coordinator in `src/application/checks/coordinator.ts` (`resolveCoordinatedCheck`:
  reads `getPendingSkillCheck` + current progression attribute + current skill
  value, resolves the tier, maps `clear/costly → passed`, `failed → failed`).
- v4 guard re-validated at target after migration (pipeline already does this).
- Verified: `npm run quality` PASS (372 unit + integration tests, content
  validation, build); e2e 6/6 PASS. Save compatibility suite green (v1→v4,
  v2→v4, v3→v4, v4 round-trip).

## Open questions

- None blocking. Whether learning creates a PC record unconditionally (vs
  requiring a prior `activatePc`) is pinned in Rev 3's typed-error posture and
  locked by a test; no redesign of WO-011/WO-020.

## Revision history

- Rev 0: initial spec after WO-021 plan approval.
- Rev 1: int participants: locked primary-attribute table, learn-only semantics,
  current-state-at-resolution, schema v4, tree-enum tightening, coordinator scope.
- Rev 2: gold vectors (incl. retry path), `0 <= roll < die` integer semantics,
  v4 canonical-set validation, tier observability through the coordinator.
- Rev 3: explicit rejection-sampling expansion rule
  (`seed + '#' + attempt`, attempt 0,1,2,…), exact band boundaries,
  per-`(occurrenceId, skillId)` ledger, default DifficultyConfig constant.