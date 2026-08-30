# FS-EVENTS-001 — Typed Domain Event Kernel

## Status
Implemented

## Problem

Dialogue, quest, inventory, and progression systems all need to record *things
that happened* (an NPC was spoken to, a choice was selected, an item was
equipped) in a shape that is:

- typed at compile time, so the reducer/observers know the payload contract;
- serializable, so events can cross subsystem / checkpoint / debug boundaries;
- verifiable, so a malformed or forged event cannot corrupt domain state;
- ordered, so state transitions are deterministic and replayable *within a
  session* without depending on wall-clock time.

Without a kernel, each subsystem would invent its own "event" shape, leading to
ad-hoc validation, non-deterministic replay, and brittle save logic.

## Player value

Invisible to the player in the abstract, but it is the substrate that makes
deterministic quest/dialogue progression and reliable checkpoints possible.
The player benefits from consistent consequences and a save system that never
restores a corrupted world state.

## Scope

### In

- A `DomainEvent` type family: occurrence identity (`id`), semantic category
  (`type`), JSON-only `payload`, and kernel-assigned logical `sequence`.
- A `DraftEvent` (an event without a `sequence`) accepted by the processor.
- An event-type registry used to reject unknown event categories at the
  processing boundary.
- JSON-safety validation (structural values only; cycle-guarded).
- EventId / EventType / Sequence validation at kernel entry points.
- A session-scoped processor that:
  - assigns ascending logical sequences; and
  - deduplicates by `id` without invoking the reducer a second time.
- Deterministic, non-mutating, transactional processing semantics.
- A type-only command boundary (`GameCommand`) mirroring `docs/16`.
- Public barrel exports and module-graph integration tests.

### Out

- Any subsystem ownership: dialogue / quest / save / inventory / progression
  registration or logic (WO-010/011/012/013/020/022).
- Persistence of events. No event log, no event store, no replay hydration.
- Event sourcing of any form (see architectural non-goal below).
- Pub/Sub, EventEmitter, or any observer/dispatch bus.
- Wall-clock / timestamp semantics or any real-time ordering authority.
- Persistence of the dedup memory. The kernel deduplicates for the lifetime of
  a processor instance; how long event memory lives is a future spec decision
  (likely WO-013 Save System).
- Event generation / UUID creation. Occurrence IDs are supplied by the caller;
  the kernel only validates them.
- Any `EventType` registration for future systems, including content-driven
  types owned by WO-010.
- Any import of Phaser, React, browser APIs, IndexedDB, or network.

## User flow

None directly. The kernel is exercised indirectly whenever a user action
funnels into `processEvent`; users never touch raw events.

## Domain model

- `EventId` — opaque occurrence identity (branded string). Distinct from
  `EventType`: one event category has one `EventType` but many `EventId`s.
  The kernel never generates these; generation happens outside the kernel
  (e.g., a caller-provided id for each interaction).
- `EventType` — semantic category string (`scene.entered`, `npc.talked`,
  `dialogue.choice_selected` are documented examples only; actual
  registrations belong to their owning Work Orders).
- `Sequence` — positive integer, assigned exclusively by the processor,
  ascending from 1. Logical ordering only, no wall-clock authority.
- `JSONValue` — structural JSON-safe value: `null | boolean | number | string
  | JSONValue[] | { [key: string]: JSONValue }`.
- `DraftEvent` — an occurred fact without `sequence` (`Omit<DomainEvent,
  'sequence'>`). `Omit` is compile-time only; the processor re-rejects any
  runtime `sequence` field on entry (runtime guard).
- `Reducer<S>` — `(state: S, event: DomainEvent) => S`. Pure, non-mutating.
- `EventProcessingState` — `{ seenIds: ReadonlySet<EventId>,
  nextSequence: number }`. Immutable input; success produces a new state.
- `DomainEventContractError` — single error type with a `code` discriminant.
- `GameCommand` — type-only intent shape (see `docs/16`); a command is never a
  `DomainEvent`.

## State machine

None beyond `EventProcessingState` transitions:

```
P0 + State0 + Draft -> validate -> dedup check -> P' + State' + DomainEvent
```

On duplicate id: returns `{ ok: false, reason: 'duplicate-id' }` and leaves
`P0` and `State0` untouched. On reducer failure (the reducer throws): the error
propagates unchanged, neither `P0` nor `State0` is consumed or mutated, and the
id is NOT added to `seenIds`. The same draft remains processable afterwards.

## Inputs / outputs

- Inputs: `DraftEvent`, `EventTypeRegistry`, `Reducer<S>`,
  `EventProcessingState`, domain state `S`.
- Outputs (`processEvent`): `ProcessResult<S>` =
  - `{ ok: true, state: S, event: DomainEvent, process: EventProcessingState }`, or
  - `{ ok: false, reason: 'duplicate-id', eventId }`.
- Throws `DomainEventContractError` for malformed input: unknown type,
  invalid id, invalid payload, injected `sequence`, unparseable shapes.

## Data contract

```ts
export type EventId = string & { readonly __brand: 'EventId' };
export type EventType = string;
export type Sequence = number & { readonly __brand: 'Sequence' };

export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };

export interface DomainEvent<T extends EventType = EventType, P extends JSONValue = JSONValue> {
  readonly id: EventId;
  readonly type: T;
  readonly payload: P;
  readonly sequence: Sequence;
}

// Omit<DomainEvent, 'sequence'>; also rejected at runtime if a `sequence`
// property is present on the object handed to the processor.
export type DraftEvent<T extends EventType = EventType, P extends JSONValue = JSONValue> =
  Omit<DomainEvent<T, P>, 'sequence'>;

export type Reducer<S, E extends DomainEvent = DomainEvent> = (state: S, event: E) => S;

export type DomainEventContractCode =
  | 'invalid-event-id'
  | 'invalid-event-shape'
  | 'unknown-event-type'
  | 'non-json-payload'
  | 'invalid-sequence';
```

Command boundary (type-only, mirror of `docs/16`):

```ts
export type SaveSlot = string; // minimal stub; WO-013 owns the real definition
export type GameCommand =
  | { type: 'interaction/use'; targetId: string }
  | { type: 'dialogue/select'; dialogueId: string; choiceId: string }
  | { type: 'inventory/equip'; itemId: string }
  | { type: 'skill/learn'; skillId: string }
  | { type: 'save/request'; slot: SaveSlot }
  | { type: 'scene/exit'; exitId: string };
```

Module surface:

```ts
// registry
createEventTypeRegistry(types: readonly EventType[]): EventTypeRegistry;
hasEventType(registry: EventTypeRegistry, type: EventType): boolean;

// validation
isJSONValue(value: unknown): value is JSONValue;   // cycle-guarded
assertJSONValue(value: unknown): void;             // throws 'non-json-payload'
isValidEventId(s: string): s is EventId;           // structural: non-empty, <=128, printable ASCII
asEventId(s: string): EventId;                     // throws 'invalid-event-id'
isValidSequence(n: number): n is Sequence;         // positive finite integer
asSequence(n: number): Sequence;                   // throws 'invalid-sequence'
validateEvent(value: unknown, registry: EventTypeRegistry): asserts value is DomainEvent;

// processor
createProcessingState(): EventProcessingState;
hasProcessed(process: EventProcessingState, id: EventId): boolean;
processEvent<S>(process: EventProcessingState, state: S, draft: DraftEvent,
                registry: EventTypeRegistry, reducer: Reducer<S>): ProcessResult<S>;
applyReducer<S>(state: S, event: DomainEvent, reducer: Reducer<S>): S;
```

EventId shape policy: non-empty, at most 128 characters, printable ASCII only
(`0x21..0x7E`), no control characters or whitespace. This is deliberate
minimal structural safety; no semantic encoding, no UUID requirement, no
timestamp, no browser-crypto dependency. Occurrence-id generation is a caller
concern.

## Error / failure modes

| Condition | Result |
|---|---|
| Duplicate `EventId` | Result `{ ok: false, reason: 'duplicate-id' }`; reducer NOT invoked; no state/no sequence consumed |
| Type not in registry | Throws `DomainEventContractError('unknown-event-type')` BEFORE reducer |
| Malformed / missing `id` | Throws `DomainEventContractError('invalid-event-id')` |
| Draft carries a `sequence` field | Throws `DomainEventContractError('invalid-event-shape')` |
| Non-JSON payload | Throws `DomainEventContractError('non-json-payload')` |
| Invalid `sequence` on a complete event | Throws `DomainEventContractError('invalid-sequence')` |
| Reducer throws | Error propagates unchanged; id NOT consumed; sequence NOT advanced; `EventProcessingState` untouched |
| `validateEvent` on a command-shaped value | Throws `DomainEventContractError('invalid-event-shape')` |

Kernel guarantees vs. reducer contract:

- **Kernel guarantee**: an unregistered `EventType` is rejected before the
  reducer is ever invoked. Fail-fast at the boundary.
- **Reducer contract (recommendation, not kernel-enforceable)**: a reducer may
  return the state unchanged for a registered event category it intentionally
  does not handle. The kernel cannot know a reducer's intent; it simply applies
  the reducer to every accepted, non-duplicate event.

## Save implications

- Save architecture stays **snapshot-based**: a save is a versioned
  `GameState` snapshot. There is no persistent event log and no hydrate-from-
  events load path.
- The kernel passes events to reducers; the resulting state is what a snapshot
  captures. No `GameState` field changes are introduced by this spec.
- Dedup memory is session-scoped and NOT persisted by this Work Order.

### Architectural non-goal (binding)

> Project Trisolaris Chronicle is NOT adopting Event Sourcing in
> FS-EVENTS-001. Authoritative game persistence remains snapshot-based unless
> a future ADR explicitly changes that decision.

No comment, helper, or test in this Work Order may imply replay-based hydration
or a persistent event history.

## Performance

- Kernel operations are O(1) amortized: `Set` membership for dedup, integer
  increment for sequence.
- JSON validation is depth-linear; objects are only walked when entering the
  kernel or validating across a boundary.

## Security / trust

- Payloads must pass `isJSONValue`, which rejects prototype-dependent class
  instances, `Date`, functions, `bigint`, `undefined`, non-finite numbers, and
  cyclic structures — so no host object or engine reference can smuggle into an
  event payload.
- Unknown event types fail fast before any reducer side-effect can run.
- Reducers are expected to treat state as immutable; the kernel never mutates
  `EventProcessingState` or the caller's state.

## Acceptance criteria

- AC-01 — A valid `DomainEvent` survives `JSON.stringify` / `JSON.parse`
  round-trip losslessly, and semantic equality does not depend on object key
  insertion order.
- AC-02 — Non-JSON payloads (including function, `bigint`, `Date` instance,
  class instance, cyclic object, `undefined` value/key, `NaN`, `Infinity`) are
  rejected with `non-json-payload`; a shared (non-cyclic) repeated object
  reference is accepted.
- AC-03 — `EventId` is opaque and structurally validated: empty, >128 chars,
  whitespace/space-containing, non-ASCII, and control-character ids are
  rejected; two occurrences with the same `EventType` and different ids are
  both accepted.
- AC-04 — Processing the same `EventId` twice returns
  `{ ok: false, reason: 'duplicate-id' }`; the reducer is NOT invoked the
  second time.
- AC-05 — A draft whose `type` is not in the registry throws
  `unknown-event-type` BEFORE the reducer runs; a registered type with no
  handling logic in a reducer results in the reducer being invoked and the
  state being returned unchanged (reducer contract, not kernel dispatch).
- AC-06 — The processor assigns logical sequences `1, 2, ...` in processing
  order with no wall-clock dependency, and a complete event carrying an invalid
  `sequence` (0, negative, fractional) is rejected at validation.
- AC-07 — A draft carrying a caller-supplied `sequence` property is rejected
  with `invalid-event-shape` at runtime (`Omit` is compile-time only).
- AC-08 — Processing is deterministic and non-mutating: equivalent inputs
  produce equivalent outputs, repeated application of the same reducer+event
  yields the same result, and neither the caller's processing state nor domain
  state is mutated. (Reducers are not required to be idempotent.)
- AC-09 — Processing is transactional: a reducer that throws propagates the
  error unchanged, the `EventProcessingState` and domain state are untouched,
  and the id/sequence are not consumed (the same draft remains processable).
- AC-10 — A command-shaped value is not a `DomainEvent`: rejected at runtime
  by `validateEvent`, and structurally unassignable at the type level in both
  directions.
- AC-11 — A public-API integration round-trip works end-to-end: process →
  serialize → parse → validate → apply to equivalent state → same result.

## Test plan

| AC | Test type | Test |
|---|---|---|
| AC-01 | Unit | `tests/unit/events/serialization.test.ts` |
| AC-02 | Unit | `tests/unit/events/serialization.test.ts` |
| AC-03 | Unit | `tests/unit/events/ids.test.ts` |
| AC-04 | Unit | `tests/unit/events/duplicates.test.ts` |
| AC-05 | Unit | `tests/unit/events/unknown-events.test.ts` |
| AC-06 | Unit | `tests/unit/events/sequence.test.ts` |
| AC-07 | Unit | `tests/unit/events/sequence.test.ts` |
| AC-08 | Unit | `tests/unit/events/determinism.test.ts` |
| AC-09 | Unit | `tests/unit/events/transactional.test.ts` |
| AC-10 | Unit | `tests/unit/events/commands.test.ts` |
| AC-11 | Integration | `tests/integration/events-roundtrip.test.ts` |

No replay/save-hydration tests exist by design (snapshot persistence).

## Implementation notes

Implemented in WO-002. Source lives in `src/domain/events/` and re-exports
through the `@domain` barrel (`src/domain/index.ts`).

- `types.ts` — `EventId`/`EventType`/`Sequence` (branded), `JSONValue`,
  `DomainEvent`, `DraftEvent`, `Reducer`, `EventContractCode`,
  `DomainEventContractError`, `SaveSlot` stub, `GameCommand` (type-only).
- `registry.ts` — `createEventTypeRegistry`, `hasEventType`.
- `validation.ts` — `isJSONValue` (cycle-guarded, rejects host objects,
  Date/functions/bigint/cyclic/undefined/NaN/Infinity), `assertJSONValue`,
  `isValidEventId`/`asEventId`, `isValidSequence`/`asSequence`,
  `validateEvent(value, registry)` (asserts narrow to `DomainEvent`).
- `processor.ts` — `EventProcessingState`, `createProcessingState`,
  `hasProcessed`, `ProcessResult`, transactional `processEvent`, `applyReducer`.
  `processEvent` rejects a draft carrying any `sequence` property at runtime;
  duplicate ids return `{ ok: false, reason: 'duplicate-id' }` without invoking
  the reducer; a throwing reducer propagates unchanged without consuming the id
  or the sequence; success returns a brand-new processing state.

Deviation record (refactoring within the approved plan, no scope change):
- `validateEvent` and the internal draft guard detect missing required fields
  first as `invalid-event-shape` (rather than letting the value checks rule),
  so a command-shaped value is rejected with the shape code as specified.
- `isJSONValue` uses an ancestor-path `Set` (not a global seen-set) so shared
  but acyclic references are accepted — matching the AC-02 test.

### Verification evidence (acquired at WO-002 close)

```text
npm run test:unit        -> 9 files pass (28 tests)
npm run test:integration -> 2 files pass (3 tests)
npm run typecheck        -> PASS
npm run lint             -> PASS (--max-warnings 0)
npm run build            -> PASS
npm run quality          -> PASS
npm run ci               -> PASS (quality + playwright E2E 4/4 chromium)
npm run verify:pipeline  -> exit 0; ALL 8 EXPECTED FAILURES CONFIRMED
```

Repository inspection: `src/domain/**` contains no imports from Phaser, React,
browser APIs, or IndexedDB and no `any`.

## Open questions

- Persistence duration of dedup memory: deferred to WO-013 (Save System).
- Whether `assertValidDraft` should become a public export for content-driven
  draft validation: deferred to WO-010 (Content Schema).

## Revision history

- v1: Spec created as part of WO-002 planning; incorporates the three approved
  clarifications (transactional processing, draft `sequence` rejection, and the
  kernel-guarantee vs reducer-contract boundary) and the binding architectural
  non-goal about Event Sourcing.
- v2: Status moved to Implemented with proof of Red/Green/Refactor and
  verification evidence; implementation notes and deviation record added.