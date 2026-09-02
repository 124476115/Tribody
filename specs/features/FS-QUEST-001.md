# FS-QUEST-001 — Quest Runtime

## Status

Implemented (WO-012)

## Problem

Quest progression needs a pure, deterministic, event-driven engine: quests
start, listen for domain events, advance objectives, resolve exactly once, and
can never accidentally regress a resolved quest. Like dialogue (FS-DIALOGUE-001),
the quest engine must be save-safe (snapshot, not event sourcing) and free of
UI/framework dependencies.

WO-002 owns event validity at its boundary; this spec owns what a valid
`DomainEvent` does to quest state.

## Player value

Reliable quest progression and a journal that always reflects truth. Exact-once
semantics prevent: an objective completing twice from one occurrence, the same
occurrence scoring two quests wrongly, and resolution rewards/outcomes firing
twice. This is the substrate WO-013 snapshots and future reward systems rely on.

## Scope

### In

- A pure quest runtime (`src/domain/quest/`): `questInit`, `questStart`,
  `questArchive`, `questApplyEvent`, journal projection.
- Canonical lifecycle `locked | available | active | resolved_success |
resolved_costly | resolved_failure | archived`; authoring `initialState`
  restricted to `locked | available | active` (WO-010 narrow correction).
- `listensFor` matching against `DomainEvent.type` (never `EventId`).
- Structured host-event contracts for the objective kinds whose producers are
  defined (`evidence.collected`, `npc.talked`, `scene.entered`,
  `world.interaction`, `dialogue.choice_selected`); semantic one-shot matching
  via `listensFor` for all kinds.
- Per-quest exact-once ledger `QuestState.processedEventIds`.
- Structural listenability checks at init (reject impossible required
  objectives where detectable).
- Resolution to `manifest.resolution.onAllRequiredComplete`, exactly once,
  inside the same atomic transition that completes the last required objective.
- JSON-safe, byte-deterministic, snapshot-serializable state.
- Journal as a pure projection of `QuestState`.
- Meaningful fact transitions only: `quest_started`, `objective_progressed`,
  `objective_completed`, `quest_resolved`, `quest_archived`.

### Out

- Save persistence (WO-013), any Event sourcing / replay hydration, a global
  EventBus/EventLog, timers/real-time/polling, Phaser/React/browser APIs.
- Any reward execution (XP / items / medals / codex) — no placeholder reward
  outputs exist; owning systems introduce them later.
- Command exact-once request-ledger machinery (not an acceptance requirement).
- New gameplay systems, content-schema features beyond the authorized
  `initialState` correction, numeric counter objectives, objective prose keys.
- Campaign content.

## User flow

Invisible in isolation. A player action funnels into a `DomainEvent`
(dialogue choice → `ch04.raw_data_compare_requested`; exploration/inventory
later → `evidence.collected`, `npc.talked`, ...); the host feeds it through
WO-002 `processEvent` and then `questApplyEvent`; the journal UI renders
`getJournalView`.

## Domain model

- `QuestStatus` — runtime lifecycle (canonical set above). Save restore uses
  runtime status; content `initialState` is only an initial seeding value.
- `QuestState` — one per quest:
  `{ questId, status, objectives: Record<objId, ObjectiveState>,
processedEventIds: string[], nextTransitionOrdinal, history }`.
- `ObjectiveState` — `{ objectiveId, complete, matchedKeys }` where
  `matchedKeys` is an unordered set (JSON array) of semantic keys
  (evidence ids for `collect_evidence`, single scope id for the others).
  Set semantics: identical keys never count twice.
- `QuestProcessedEventIds` — occurrence ledger owned by EACH `QuestState`.
  An `EventId` that progressed a quest is recorded there; redelivery to that
  quest produces no further progress/output. The same `EventId` legitimately
  advances several quests once each. No global ledger exists.
- `QuestTransition` — one surface fact produced by a step
  (see Data contract). Hosts may translate `quest_resolved` /
  `quest_archived` into their own events; the domain emits facts only.
- `DomainEvent` — consumed as-is from WO-002 (already validated). The quest
  engine never re-validates the kernel contract and never classifies a
  registered-but-unmatched event as "unknown event type" — that distinction
  belongs to WO-002. It reports `irrelevant / unmatched` instead.
- `QuestDomainError` — typed errors (see Errors).

## Event model

Two families. Both use dotted names (`isSemanticEventName` grammar).

- **Semantic one-shot family** — `event.type` IS the semantic name
  (`ch04.raw_data_compare_requested`). Matched only via `listensFor`; no
  payload contract; one occurrence completes the listening objective.
- **Structured family** — typed with a payload contract (names from
  `docs/04` §3):

  | Objective kind                                             | Default `event.type`       | Scope on payload                         |
  | ---------------------------------------------------------- | -------------------------- | ---------------------------------------- |
  | `collect_evidence`                                         | `evidence.collected`       | `payload.evidenceId ∈ evidenceIds` (set) |
  | `talk`                                                     | `npc.talked`               | `payload.npcId === npcId`                |
  | `go_to`                                                    | `scene.entered`            | `payload.sceneId === sceneId`            |
  | `interact`                                                 | `world.interaction`        | `payload.sceneId === sceneId`            |
  | `choose`                                                   | `dialogue.choice_selected` | `payload.dialogueId === dialogueId`      |
  | `analyze`, `wait_for_event`, `repair`, `escort`, `survive` | none                       | `listensFor` required                    |

- Objective with non-empty `listensFor`: matches iff `event.type ∈ listensFor`
  (type-only, overrides the default rule). Otherwise the default contract
  applies (scope check as above).
- **`listensFor` ⇄ `DomainEvent.type`**: matching is always against `event.type`.
- **`EventId`**: occurrence identity, used only for the per-quest ledger.

## State machine

```
initialState ──questInit──▶ (seeded status)
locked ──(no unlock API this WO)──▶ available ──questStart──▶ active
active ──questApplyEvent: last required objective completes──▶
        resolved_success | resolved_costly | resolved_failure | archived
resolved_* ──questArchive──▶ archived
```

- Monotonic partial order; nothing transitions backward. `resolved_*` is
  terminal for all commands except `questArchive`; `archived` is fully terminal.
- Per-quest ordering: `nextTransitionOrdinal` counts up from 1;
  `transitionId = quest:<questId>#<ordinal>` (satisfies WO-002 `isValidEventId`).
- One event step = at most one transition per quest (multiple objectives and/or
  resolution fold into that single transition). `questStart`/`questArchive`
  produce exactly one transition.

## Idempotency (per-quest exact-once)

- `questApplyEvent(state, event)` applies the event to every quest in scope.
  For quest Q:
  1. If `event.id ∈ Q.processedEventIds` → Q unchanged (duplicate for Q).
  2. Else if the event matches no objective rule of Q → Q unchanged (irrelevant
     for Q).
  3. Else compute progress; if state changes (a key was added, an objective
     completed, or the quest resolved) → record `event.id` in
     `Q.processedEventIds` and produce one `QuestTransition`.
- An event that matches a rule but produces no change (e.g. a completed
  one-shot's rule re-matched, or a set key already present) changes nothing and
  is not ledgered — it cannot cause double progress by definition.
- Set objectives: adding an already-present key is "no change", so two distinct
  `EventId`s carrying the same `evidenceId` never double-count.
- Same `EventId` delivered to Quest A and Quest B: each quest advances at most
  once, guarded by its own ledger.
- WO-002 remains the delivery-time kernel fence (fence #1, session-scoped).
  Per-quest ledgers are the persistence-safe second fence and are part of the
  saved snapshot.

## Resolution semantics

- Triggered inside the same atomic transition that completes the **last
  required** objective while status is `active`; resolves to
  `manifest.resolution.onAllRequiredComplete`.
- Emitted as a `quest_resolved` transition with `resolution`, exactly once.
  Later `questApplyEvent` on a resolved quest contributes nothing (short-circuit
  for `resolved_*`/`archived`, without any ledger writes).
- Optional (`required:false`) objectives never block resolution and may stay
  pending; progress stops for the whole quest once resolved.
- `onAllRequiredComplete: 'archived'` resolves directly to `archived`.

## Soft-lock safety (structural only)

`questInit` rejects the whole manifest set (`impossible-required-objective`)
when any **required** objective has no reachable match rule:

- no `listensFor` AND
- objective kind has no default contract, OR
- default contract's mandatory scope field is missing/degenerate
  (`collect_evidence` without any `evidenceIds`; `talk` without `npcId`;
  `go_to`/`interact` without `sceneId`; `choose` without `dialogueId`).

Optional objectives are exempt (they cannot block resolution). This is
state-machine detectability, not level/puzzle design.

## Data contract

```ts
export type QuestStatus =
  | 'locked'
  | 'available'
  | 'active'
  | 'resolved_success'
  | 'resolved_costly'
  | 'resolved_failure'
  | 'archived';

export interface QuestObjectiveState {
  objectiveId: string;
  complete: boolean;
  matchedKeys: string[]; // unordered set, JSON array
}

export interface QuestHistoryEntry {
  kind: QuestTransitionKind;
  transitionId: string; // quest:<questId>#<ordinal>
  seq: number;
  eventId?: string;
  objectiveIds?: string[];
  resolution?: QuestResolution;
}

export interface QuestState {
  questId: string;
  status: QuestStatus;
  objectives: Record<string, QuestObjectiveState>;
  processedEventIds: string[]; // per-quest exact-once ledger
  nextTransitionOrdinal: number;
  history: QuestHistoryEntry[];
}

export interface QuestSavedState {
  quests: Record<string, QuestState>;
}

export type QuestTransitionKind =
  | 'quest_started'
  | 'objective_progressed'
  | 'objective_completed'
  | 'quest_resolved'
  | 'quest_archived';

export interface QuestTransition {
  transitionId: string;
  kind: QuestTransitionKind;
  questId: string;
  seq: number;
  eventId?: string; // present on event-driven steps
  objectiveIds: string[]; // objectives touched this step
  resolution?: QuestResolution; // present iff kind === 'quest_resolved'
}

export interface QuestJournalView {
  questId: string;
  titleKey: string;
  status: QuestStatus;
  startKey: string;
  completeKey: string;
  resolution?: QuestResolution;
  objectives: { id: string; type: QuestObjectiveKind; required: boolean; complete: boolean }[];
}
```

Result contracts:

```ts
export type QuestApplyResult =
  | { status: 'committed'; state: QuestSavedState; transitions: QuestTransition[] }
  | { status: 'irrelevant'; state: QuestSavedState }; // same reference, unchanged

export type QuestStepResult =
  | { status: 'committed'; state: QuestSavedState; transitions: QuestTransition[] }
  | { status: 'error'; error: QuestDomainError };

export type QuestInitResult =
  | { status: 'committed'; state: QuestSavedState; initializedQuestIds: string[] }
  | { status: 'unchanged'; state: QuestSavedState }
  | { status: 'error'; state: QuestSavedState; error: QuestDomainError };
```

Module surface (`src/domain/quest/`, barrel re-export via `src/domain/index.ts`):

```ts
// types.ts
createQuestDomain(): QuestSavedState;
QuestDomainError, QuestErrorCode, QuestStatus, … (above)

// matching.ts
matchObjective(objective: QuestObjectiveManifest, event: DomainEvent): boolean;
objectiveMatchOrigin(objective): 'semantic' | 'structured' | 'none';   // init support

// runtime.ts
questInit(domain, manifests: Record<string, QuestManifest>): QuestInitResult;
questStart(domain, manifests, intent: { questId }): QuestStepResult;
questArchive(domain, manifests, intent: { questId }): QuestStepResult;
questApplyEvent(domain, manifests, event: DomainEvent): QuestApplyResult;

// journal.ts
getJournalView(state: QuestState, manifest: QuestManifest): QuestJournalView;
```

## Errors

| Code                            | Thrown when                                  |
| ------------------------------- | -------------------------------------------- |
| `unknown-quest`                 | questId not in manifests / not initialized   |
| `quest-locked`                  | `questStart` on a locked quest               |
| `already-active`                | `questStart` on an active quest              |
| `quest-terminal`                | `questStart` on resolved or archived quest   |
| `invalid-transition`            | `questArchive` on a non-resolved quest       |
| `impossible-required-objective` | `questInit` listenability violation          |
| `malformed-content`             | manifest shape violation detected at runtime |

Errors return `{ status:'error', state, error }`; the previous state is
untouched and nothing is consumed.

## Fail-safe rules (invariants, WO-012)

1. A quest never transitions backward.
2. A resolved quest cannot return to `active`; a terminal quest never regresses.
3. Resolution is emitted exactly once.
4. Per-quest `processedEventIds` prevents an occurrence from progressing the
   same quest twice; set semantics prevent semantic-key double counting.
5. An irrelevant (registered but unmatched) event leaves every quest unchanged.
6. All state is JSON-safe and byte-deterministic under equivalent inputs.
7. Required objective reachability is gate-checked at init.

## Acceptance criteria

- AC-01 — `questInit` hydrates manifests into canonical lifecycle vocabulary
  (`locked|available|active` seed), inserts quests sorted by id, is naturally
  deterministic, and is idempotent (second init is a no-op, same state).
- AC-02 — `questStart` moves `available → active` and emits `quest_started`;
  `locked` → `quest-locked`; `active` → `already-active`; resolved/archived →
  `quest-terminal`; unknown id → `unknown-quest`. All errors leave state
  untouched.
- AC-03 — A matching event advances a required objective; an irrelevant
  registered event leaves all quest state unchanged (result `irrelevant`); an
  objective matches `event.type` (semantic), not `event.id` (the same type with
  a new id never re-progresses a completed one-shot objective).
- AC-04 — One `EventId` may advance two active quests once each; redelivering
  the same `EventId` never re-progresses either quest (per-quest ledgers).
- AC-05 — Set-based `collect_evidence`: completes only when all required
  evidence keys are present; two distinct `EventId`s carrying the same
  `evidenceId` do not double-count; partial progress keeps the quest active.
- AC-06 — One event matching several objectives of the same quest folds into a
  single atomic `QuestTransition` for that quest.
- AC-07 — Completing the last required objective resolves the quest to
  `manifest.resolution.onAllRequiredComplete` exactly once; pending optional
  objectives do not block it; later events contribute nothing; a resolved quest
  cannot regress.
- AC-08 — `questArchive` moves `resolved_* → archived` once; archiving a
  non-resolved quest is `invalid-transition`.
- AC-09 — `QuestSavedState` survives `JSON.stringify`/`JSON.parse` exactly;
  restoring it and continuing an identical event tail matches a fresh
  equivalent run; restored per-quest ledgers still prevent reprocessing.
- AC-10 — Equivalent inputs (order-equivalent manifest maps + identical event
  sequence) produce identical transitions and identical serialized bytes.
- AC-11 — `getJournalView` is a pure projection of `QuestState` (status,
  objective completions, resolution, keys only — no prose, no persistence).
- AC-12 — `questInit` rejects (`impossible-required-objective`) a manifest whose
  required objective has no match rule (no `listensFor` on `analyze`/
  `wait_for_event`/`repair`/`escort`/`survive`; `collect_evidence` with empty
  `evidenceIds`); optional objectives are exempt.
- purity — `src/domain/quest` imports only the events/content domains; no
  Phaser/React/Zod/Node.js.
- sample — a fixture mirroring `quest_ch04_sample.yaml` completes end-to-end
  (evidence.collected ×2 + semantic compare + npc.talked → resolved_success →
  archive → journal).

## Test plan (Red first, mapped to ACs)

| AC           | Test                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01        | `tests/unit/quest/init.test.ts`                                                                                                                                           |
| AC-02, AC-08 | `tests/unit/quest/lifecycle.test.ts`                                                                                                                                      |
| AC-03        | `tests/unit/quest/matching.test.ts` + `events.test.ts`                                                                                                                    |
| AC-04        | `tests/unit/quest/idempotency.test.ts` (`givenOneEventMatchesTwoActiveQuests_thenBothAdvanceExactlyOnce`; `givenSameEventRedelivered_thenEachQuestDoesNotDoubleProgress`) |
| AC-05        | `tests/unit/quest/idempotency.test.ts` (`givenTwoEventIdsSameEvidenceKey_doNotDoubleCount`; `givenAllRequiredEvidenceKeys_thenObjectiveCompletes`)                        |
| AC-06        | `tests/unit/quest/events.test.ts`                                                                                                                                         |
| AC-07        | `tests/unit/quest/resolution.test.ts` (+ terminal-no-regress)                                                                                                             |
| AC-09        | `tests/unit/quest/serialization.test.ts`                                                                                                                                  |
| AC-10        | `tests/unit/quest/determinism.test.ts`                                                                                                                                    |
| AC-11        | `tests/unit/quest/journal.test.ts`                                                                                                                                        |
| AC-12        | `tests/unit/quest/malformed.test.ts`                                                                                                                                      |
| purity       | `tests/unit/quest/purity.test.ts`                                                                                                                                         |
| sample       | `tests/integration/quest-runtime.test.ts`                                                                                                                                 |

## Verifiability

- `npm run quality` (format, lint, typecheck, unit, integration, validate:content, build).
- `npm run ci` (quality + E2E).
- `npm run verify:pipeline`.

## Implementation notes

- Implemented in `src/domain/quest/` (types, matching, runtime, journal; barrel
  via `src/domain/index.ts`). All 12 ACs plus the sample integration test are
  covered by `tests/unit/quest/*.test.ts` (11 files) and
  `tests/integration/quest-runtime.test.ts`.
- Refinements decided during implementation (all within the approved plan):
  - Only **active** quests advance on events (`locked`/`available` quests
    ignore them, terminal quests short-circuit). Events delivered before a
    quest is started are intentionally not retroactive (snapshot semantics,
    no Event Sourcing). `resolved_*`/`archived` are the only terminal states.
  - `questApplyEvent` skips quests whose manifest is not loaded in the current
    session (a save/restore desync concern owned by WO-013); transiting quests
    commit atomically in `domain.quests` insertion order.
  - The same `EventId` may advance several quests once each; within one quest it
    is processed once. A set-key recollection (distinct EventId, same
    `evidenceId`) adds nothing and is NOT ledgered — it cannot double-count.
  - `getJournalView` surfaces `resolution` for every terminal status
    (`resolved_*` and `archived`); `latestTransitionId` mirrors the last
    persisted history entry.
- Verification (WO-012 close):
  - `npm run quality`: PASS — format, lint (0 warnings),
    typecheck, unit 171/171 in 35 files, integration 13/13 in 5 files,
    validate:content, build.
  - `npm run ci`: PASS — quality + E2E 4/4.
  - `npm run verify:pipeline`: PASS — 8/8 expected-failure probes.

## Open questions

- Structured event producers aren't shipped yet (exploration/inventory WOs own
  `evidence.collected`/`npc.talked`/`world.interaction` payload contracts;
  they must confirm the constants in `src/domain/quest/matching.ts` before their
  own delivery). Semantic events (`question  <->  semantic names`) are fully
  usable today.
- `locked` has no unlock trigger yet; nothing in WO-012 unlocks quests. A future
  content feature would be the trigger.
- `QuestObjectiveManifest` has no per-objective journal text key; journal step
  prose is future content.

## Revision history

- v1: Created as part of WO-012 planning; incorporates the six plan-review
  corrections (per-quest dedup, canonical lifecycle + WO-010 schema correction,
  no placeholder outputs, no command request-ledger, kernel-vs-quest
  event classification, structured logix + `listensFor`-required kinds).
- v2: Status moved to Implemented with Red/Green/Refactor + verification
  evidence and implementation notes.
