# FS-DIALOGUE-001 — Dialogue Runtime

## Status

Approved for implementation under WO-011 (2026-08-30). Incorporated the WO-011
plan-review corrections (exactly-once identity, skill-check rules, error model,
minimal auto-next).

## Problem

The game requires character-driven interactive dialogue that queries world state
and produces controlled, whitelisted state changes without embedding executable
code in narrative files (no `eval`, no arbitrary JS). Deterministic, saveable
conversations must never double-apply effects even across re-render,
duplicate-command, or save/resume, and localStorage/IndexedDB payloads must stay
JSON-safe and prose-free.

## Player value

Conversation is interactive and remembers what the player has learned/chosen.
A choice is never applied twice by retry/replay plumbing, and the narrative never
hard-locks.

## Scope

### In

- Pure domain runtime: `start`, node advance, `select` choice, conditions,
  whitelisted effects (as emitted requests), skill-check routing hook, history,
  saveable session state, end.
- One committed runtime transition per step (auto-next advanced one step per
  `advance` request).
- Deterministic exact-once semantics: caller-supplied `requestId` ledger +
  session-local transition ordinals.
- Defensive runtime guards for the transition being performed (missing next
  node, self-loop, stale choices, canon-protected effects).
- Serialization contract (`DialogueSavedState`) for WO-013.

### Out

- React dialogue UI, portraits, animations, typewriter effects.
- Phaser integration.
- Audio playback (voice/cue exposure only).
- Localization rendering engine (only stable localization keys travel in state).
- Quest Engine, Inventory, Relationship Engine, XP/Skill System, dice/RNG.
- LLM/live-generated dialogue.
- Event Sourcing.
- Save persistence (WO-013) and any save migration.

## User flow

1. Player triggers an NPC conversation → application calls
   `dialogueStart(domain, manifest, { requestId, dialogueId })`.
2. Runtime moves to the entry node and returns the committed transition.
3. Application applies emitted `EffectRequest[]` (if any, through future
   engines), optionally broadcasts one WO-002 `DraftEvent` (id = transitionId),
   and renders `DialogueView`.
4. Player picks a choice → `dialogueSelect(...)`; `DialogueView` is rederived.
5. If the choice carries a `skillCheck`, the runtime parks in
   `awaitingSkillCheck` and exposes the pending `SkillCheckRequest`; the future
   WO-021 resolver eventually calls `dialogueResolveSkillCheck(...)` with an
   explicit outcome.
6. Leave → `dialogueEnd(...)`; `next: 'end'` also terminates.
7. WO-013 snapshots `DialogueSavedState`; resume restores it byte-identical.

## State machine

Domain-level modes are exactly: `idle | onNode | awaitingSkillCheck | ended`.
`idle` is represented structurally as "no active session". There is **no
persisted technical `failed` mode**: runtime validation failures raise a typed
`DialogueDomainError` result and leave the previous state unchanged.

```
idle ── start(dialogueId, requestId) ──▶ onNode(entryNode)      [effects = entry.onEnter]
onNode(node) ── select(choiceId, requestId) ──▶ onNode(choice.next)         [choice.target.onEnter + choice effects]
onNode(node) ── select(choiceId, requestId) ──▶ awaitingSkillCheck          [choice.skillCheck; pinned {node,choice}; no effects yet]
awaitingSkillCheck ── resolve({choiceId, outcome}) ──▶ onNode(choice.next)  [passed: effects+onEnter / failed: onEnter only]
onNode(node) ── advance(requestId) ──▶ onNode(node.autoNext)                [autoNext present; target.onEnter]
   onNode(node) ── advance ──▶ ended                                       [autoNext === 'end']
onNode/awaitingSkillCheck ── end(requestId) ──▶ ended
ended ── any intent except end/start ──▶ error
```

- One request → at most one committed transition. An `autoNext` chain advances
  only one node per `advance` request; the application drives further steps.
  A single step can therefore never hang on a chain.

## Domain model

All contracts live in `src/domain/dialogue/` (pure TypeScript, no Phaser/React/
Zod/Node.js; depends only on `src/domain/content` contracts + guards).

### DialogueSessionState (persisted)

```ts
interface DialogueSessionState {
  dialogueId: string;
  instanceOrdinal: number;            // occurrence id within the domain, see Exact-once
  mode: 'onNode' | 'awaitingSkillCheck' | 'ended';
  nodeId: string | null;
  pendingCheck: { nodeId: string; choiceId: string } | null;
  nextTransitionOrdinal: number;      // session-local monotonic counter
  history: DialogueHistoryEntry[];
}

interface DialogueSavedState {        // single active session per domain (WO-011 scope)
  active: DialogueSessionState | null;
  processedRequestIds: string[];      // exact-once request ledger
  nextInstanceOrdinal: Record<string, number>;  // per dialogueId
}
```

Serialization rules: only stable IDs, JSON-safe primitives, no `DialogueManifest`
references, no functions/Zod/Zod instances/React/Phaser objects, no prose.

### DialogueHistoryEntry (persisted, compact)

```ts
type DialogueHistoryEntry =
  | { kind: 'started'; dialogueId; transitionId; seq }
  | { kind: 'node_entered'; dialogueId; transitionId; nodeId; seq }
  | { kind: 'choice_selected'; dialogueId; transitionId; nodeId; choiceId; outcome?: 'passed'|'failed'; seq }
  | { kind: 'ended'; dialogueId; transitionId; seq };
```

Store the node id, choice id, outcome (if any), and the transition id. Never
store localization keys, prose, or duplicated text.

### DialogueTransition (per committed step)

```ts
interface DialogueTransition {
  transitionId: string;          // dialog:<dialogueId>#<instanceOrdinal>#<ordinal>
  kind: 'started' | 'node_entered' | 'choice_selected' | 'skill_check_requested' | 'ended';
  dialogueId: string;
  sourceNodeId: string | null;
  targetNodeId: string | null;
  choiceId?: string;
  outcome?: 'passed' | 'failed';
  effects: EffectRequest[];      // only the newly-committed effects
  voiceCueIds: string[];         // exposure only
  skillCheck?: SkillCheckRequest;
}

type EffectRequest = DialogueEffect & { instanceId: string };   // instanceId = <transitionId>:<index>
```

### DialogueView (recomputed, never persisted)

```ts
interface DialogueView {
  dialogueId: string; mode: DialogueMode; nodeId: string | null;
  speaker: string; textKey: string; voiceCueId?: string;
  portraitState?: string; tags: string[];
  choices: ChoiceView[];
}
interface ChoiceView { id: string; textKey: string; enabled: boolean; hasSkillCheck: boolean; }
```

### Intents (state-changing; each carries an opaque caller-supplied `requestId`)

```ts
type DialogueIntent =
  | { requestId; dialogueId }                       // start
  | { requestId; choiceId }                         // select
  | { requestId }                                   // advance
  | { requestId; choiceId; outcome }                // resolve skill check
  | { requestId };                                  // end
```

### Result

```ts
type DialogueResult =
  | { status: 'committed'; state: DialogueSavedState; transition: DialogueTransition }
  | { status: 'duplicate'; state: DialogueSavedState }        // same requestId seen before → noop
  | { status: 'error'; error: DialogueDomainError };
```

### DialogueDomainError

Single error type with a `code` discriminant:

```ts
type DialogueErrorCode =
  | 'not-active'            // operation requires an active session (select/advance/resolve/end on idle/ended)
  | 'already-active'        // start while a session is active
  | 'unknown-dialogue'      // start: dialogueId has no manifest
  | 'malformed-content'     // entry node / next node / choice missing from runtime-supplied manifest
  | 'invalid-transition'    // stale choice, not-available choice, missing autoNext, resolve mismatch, etc.
  | 'self-loop'             // autoNext points at the current node
  | 'canon-protected-effect'// set_flag into canon.* / era.transition.* at runtime
  | 'unknown-condition-kind';
```

Guarantees on error: previous `DialogueSavedState` is returned unchanged, **no
effects are emitted**, the **requestId is not recorded**, and the **transition
ordinal is not consumed**.

## Intention identity vs transition identity (exactly once)

- **Request identity** = the opaque caller-supplied `requestId` on every
  state-changing intent. The domain never generates it. `processedRequestIds`
  is the persisted ledger.
  - Same `requestId` seen again → `duplicate` result: no effects, no state
    advance, no ordinal consumed.
  - A **new** `requestId` that legitimately selects the same choice/node after a
    dialogue loop commits normally (a genuine second occurrence re-emits its
    effect requests).
- **Transition identity** = `dialog:<dialogueId>#<instanceOrdinal>#<nextTransitionOrdinal>`,
  assigned from a session-local monotonic counter at commit time. Not derived
  from `node + choice`, so repeated visits to the same node/choice never collide.
  `instanceOrdinal` is incremented per `start` of a dialogueId so a restarted
  dialogue produces fresh ids (distinct WO-002 `EventId`s across occurrences).
- **Effect exact-once meaning in WO-011**: the runtime *emits* `EffectRequest[]`:
  it does not execute Quest/Inventory/Relationship/Audio mutations. "Exactly
  once" here means a given accepted request can never cause the same
  transition/effect requests to be emitted twice. Applications/engines own real
  mutation; WO-002 additionally dedups the broadcast by its `EventId`
  (= transitionId). No Event Sourcing.

## Conditions

- Evaluated over a minimal **read-only, serializable** snapshot the application
  builds from whichever future engines exist (WO-011 supplies none):

  ```ts
  interface DialogueSnapshot {
    activeChapterId: string;
    activeSceneId: string;
    flags: Readonly<Record<string, boolean>>;
    questStates: Readonly<Record<string, string>>;
    relationships: Readonly<Record<string, Readonly<Record<string, number>>>>;
    skillValues: Readonly<Record<string, number>>;
    itemCounts: Readonly<Record<string, number>>;
    codexUnlocked: Readonly<Record<string, boolean>>;
  }
  ```

- The evaluator covers exactly the 7 WO-010 condition kinds through an exhaustive
  `switch` with an `assertNever` fallback. An unknown kind (e.g. runtime-supplied
  corrupt manifest) raises `DialogueDomainError('unknown-condition-kind')` — it
  is **never** silently true/false.
- `has_item` honors `count ?? 1`. `chapter_state { chapterId }` (which has no
  expected-state field in WO-010) is satisfied iff `activeChapterId === chapterId`;
  flagged for re-spec if WO-021 needs richer semantics.
- Conditions decide choice **availability** (`ChoiceView.enabled`) and guard
  `select` (stale/disabled choices are rejected at runtime).

## Effects

- The runtime translates validated `Effect[]` into `EffectRequest[]` (one
  canonical transformation; no execution). `play_audio`/`quest_event`/etc. are
  emitted as requests for future engines/adapters.
- **Canon defense-in-depth**: `set_flag` targeting `canon.*` or
  `era.transition.*` (re-checked via `isCanonProtectedFlag`) aborts the
  transition with `canon-protected-effect`, even if content bypassed WO-010.
- No `eval`, no arbitrary JS, no user-supplied scripts.

## Skill checks

- When a selected choice has `skillCheck`, the runtime parks in
  `awaitingSkillCheck`, pins `{ nodeId, choiceId }`, and returns a
  `skill_check_requested` transition exposing:
  `{ dialogueId, instanceOrdinal, nodeId, choiceId, skillId, threshold }`.
- The pending check is part of serializable session state and **survives JSON
  round-trip** (save/resume). No timeout semantics are implemented in WO-011.
- `resolveSkillCheck` requires an explicit `outcome: 'passed' | 'failed'`:
  - the request is rejected (error, state unchanged) when no check is pending or
    the `choiceId` does not match;
  - `passed` → commit the choice transition **with** its effects;
  - `failed` → commit the transition **without** the choice's effects
    (target node's `onEnterEffects` still apply; the narrative always proceeds).
- **Missing resolver is never treated as failure.** Without a resolver the
  runtime simply stays in `awaitingSkillCheck` with the pending request exposed;
  WO-011 never invents a gameplay failure because an external dependency is
  unavailable.
- This is the deliberate, minimal temporary semantics. A richer routing
  (e.g. distinct `failureNext`) is a **future content/schema evolution** (WO-021
  → WO-010 change + migration); WO-011 does not invent `failureNext`, and the
  chosen semantic never hard-locks and never applies success effects on failure.

## Auto-next

- One runtime step performs one transition. An `autoNext` chain therefore cannot
  hang inside a single domain call; WO-010 already performs structural cycle
  validation, and the application drives repeated `advance` requests. There is no
  `advanceAutoChain()` orchestration layer (deferred unless an AC demands it).
- The runtime defensively validates only the transition it is performing:
  `autoNext === current node` → `self-loop`; the target node not present in the
  runtime-supplied manifest → `malformed-content`.

## Canon protection

Covered by the Effects boundary (runtime `isCanonProtectedFlag` re-check) and by
WO-010 author-time guard. Ordinary dialogue content can never mutate macro canon
anchors or era transitions.

## Invariants (WO-011)

1. One request → at most one committed transition.
2. Accepted `requestId`s are never re-applied (duplicate → noop).
3. New `requestId` on a legitimately repeated node/choice commits normally.
4. A runtime error emits no effects, consumes no `requestId`, consumes no
   transition ordinal, and leaves state unchanged.
5. The failed/passed skill-check path never applies success effects on failure
   and never hard-locks.
6. Pending skill checks survive save/resume.
7. No persisted technical `failed` mode.
8. State contains only stable IDs / JSON-safe values (no prose, no objects).
9. Canon-protected mutations are impossible.
10. Deterministic: equivalent manifests + equivalent intent sequences →
    equivalent states and transition ids.

## Acceptance criteria

- AC-01 Start lands on the entry node (correct `node_entered`/`started`
  transition, entry `voiceCueId`/text exposed).
- AC-02 Conditional choices reflect the current snapshot (`ChoiceView.enabled`);
  stale/disabled choices are rejected on select.
- AC-03 Selecting a choice emits whitelisted `EffectRequest[]` (incl. target
  node `onEnterEffects`) with stable `instanceId`s; no execution.
- AC-04 Effects are emitted exactly once per accepted request (same `requestId`
  replay → no emission; legitimate loop with a new `requestId` → re-emission).
- AC-05 Save/resume restores the identical active state (node, choices, history,
  pending check) and identical continuation behavior.
- AC-06 Defensive auto-next guard: self-loop and missing-target nodes produce a
  typed error with unchanged state.
- AC-07 Canon namespaces cannot be mutated by ordinary dialogue (runtime guard).
- AC-08 Bad transitions are rejected: invalid choice, advance without
  auto-next, action on `ended`, mismatched skill-check resolution, unknown
  dialogue, start while active.
- AC-09 Skill-check routing hook: pinned pending check, explicit resolution
  required, pending check survives serialization, missing resolver is never
  treated as failure.
- AC-10 Deterministic equivalent input → equivalent output (order-independent
  manifest construction → identical transition sequence and serialized state).
- AC-11 End state: `next: 'end'` and explicit `end` both reach `ended`; all
  further intents are rejected.

## Test plan (Red first, mapped to ACs)

| AC        | Test |
| --------- | ---- |
| AC-01     | `tests/unit/dialogue/runtime.test.ts` — start lands on entry node, exposes textKey/voiceCueId |
| AC-02     | `tests/unit/dialogue/conditions.test.ts` (evaluator kinds/unknown), `runtime.test.ts` (visibility + stale-select rejection) |
| AC-03     | `tests/unit/dialogue/effects.test.ts` (translation + instanceIds), `runtime.test.ts` (emission incl. onEnter) |
| AC-04     | `runtime.test.ts` — duplicate same `requestId` → noop; same choice via loop + new `requestId` → commits |
| AC-05     | `tests/unit/dialogue/serialization.test.ts` — JSON round-trip preserves state; pending check survives |
| AC-06     | `runtime.test.ts` — self-loop + missing target → error, unchanged state |
| AC-07     | `effects.test.ts`, `runtime.test.ts` — canon `set_flag` refused, no effects, no commit |
| AC-08     | `runtime.test.ts` — all rejection paths; **error does not consume requestId**; **error does not consume ordinal** |
| AC-09     | `runtime.test.ts` + `serialization.test.ts` — pin/resolve/round-trip/required-explicit/missing-resolver-stays-pending |
| AC-10     | `tests/unit/dialogue/determinism.test.ts` — two order-equivalent manifests → identical results; byte stability |
| AC-11     | `runtime.test.ts` — end reachable via `next:'end'` and explicit `end`; intents rejected afterwards |
| purity    | `tests/unit/dialogue/purity.test.ts` — `src/domain/dialogue` free of Phaser/React/Zod/Node.js |
| sample    | `tests/integration/dialogue-runtime.test.ts` — branching sample conversation end-to-end (mirrors `content_examples/dialogue_ch04_sample.yaml` structure; no prose copied) |

## Verifiability

- `npm run quality` (format, lint, typecheck, unit, integration, validate:content, build).
- `npm run ci` (quality + E2E).
- `npm run verify:pipeline`.

## Implementation notes

- Implemented as `src/domain/dialogue/` (types.ts, conditions.ts, effects.ts,
  runtime.ts, index.ts); pure TS; exported via `src/domain/index.ts`.
- Intents are raw params; `requestId` is opaque and caller-supplied. Dedup uses
  a persisted `processedRequestIds` ledger on `DialogueSavedState`; replay
  returns the same state reference (no effects, no ordinal consumed).
- Transition identity `dialog:<dialogueId>#<instanceOrdinal>#<ordinal>` uses a
  session-local monotonic `nextTransitionOrdinal`; verified to satisfy
  `isValidEventId` (WO-002 kernel dedup fence remains the app engine's job).
- One step commits exactly one transition and emits exactly one ordered
  `EffectRequest[]` with `instanceId = <transitionId>:<index>`; failed skill
  checks advance without choice effects, target `onEnterEffects` still apply.
- Skill-check park commits `skill_check_requested` (no effects) and pins
  `pendingCheck` on the session; resolution with mismatched/pending-skill
  request ids or missing pending choice is rejected. No persisted `failed`
  mode; errors are typed `DialogueDomainError` results that leave state
  untouched.
- Auto-next is single-step: `dialogueAdvance` consumes one `autoNext` hop per
  call; `self-loop`/missing-target are rejected with `self-loop` /
  `malformed-content`. `DIALOGUE_END = 'end'` sentinel terminates.
- Condition evaluator covers exactly the WO-010 kinds; unknown kinds throw
  `unknown-condition-kind` (defense-in-depth, content validation is the
  baseline). Canon protection re-checks `isCanonProtectedFlag` in
  `translateEffects` before any commit.
- Serialization: `DialogueSessionState` + ledger are plain JSON-safe values;
  `getDialogueView` is recomputed, never persisted.
- AC evidence: see Test plan table above; all tests in
  `tests/unit/dialogue/*.test.ts` + `tests/integration/dialogue-runtime.test.ts`
  are Green; `npm run quality` PASS.

## Open questions

- `chapter_state` carries no expected-state value (WO-010 shape). Current
  semantics: active-chapter equality. Re-spec needed if a richer state query is
  desired (WO-021+).
- Skill-check failure routing is a minimal placeholder (advance without effects).
  WO-021 may require a `failureNext`-style content evolution → WO-010 change +
  `contentVersion` bump + migration.
- Pruning policy for ended/restarted sessions and the global `processedRequestIds`
  ledger is deferred to WO-013 (journal use-cases may steer it).

## Revision history

- v1: Original approved spec.
- v2: Rewritten for WO-011 with plan-review corrections: requestId ledger vs
  transition ordinals, skill-check never defaults to failure, error model
  without persistent `failed` mode, single-step auto-next, effects-as-emissions.