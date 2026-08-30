# WO-002 — Domain Event Kernel

Goal: typed serializable events + command boundary.

Spec first: create `specs/features/FS-EVENTS-001.md`.

Tests first:
- event is serializable
- duplicate ID handling contract
- unknown event rejection/ignore policy
- deterministic reducer behavior

No Phaser imports in domain.

---

## Implementation Notes

### As built

Spec: `specs/features/FS-EVENTS-001.md` (Status Implemented).

Prod (pure TS, no framework imports):

- `src/domain/events/types.ts` — events + command contracts, brand types,
  `DomainEventContractError`.
- `src/domain/events/registry.ts` — `createEventTypeRegistry` / `hasEventType`.
- `src/domain/events/validation.ts` — `isJSONValue` (cycle-guarded),
  `assertJSONValue`, EventId/Sequence guards, `validateEvent` (asserts
  narrow to `DomainEvent`).
- `src/domain/events/processor.ts` — transactional `processEvent`,
  `applyReducer`, `EventProcessingState` (immutable; success returns new
  state). Unknown types fail fast BEFORE the reducer; duplicates return
  `'duplicate-id'` without invoking the reducer; a throwing reducer
  propagates unchanged without consuming id or sequence; a draft carrying a
  runtime `sequence` field is rejected (`invalid-event-shape`).
- `src/domain/events/index.ts` + `src/domain/index.ts` barrel re-export.
- The WO-000 placeholder exports (`DOMAIN_LAYER_VERSION`,
  `createDomainPlaceholder`) were retired; both smoke tests were repointed to
  the event kernel.

Tests (11 ACs, all pass on unit + integration):

- unit: `tests/unit/events/{serialization,ids,duplicates,unknown-events,
  sequence,determinism,transactional,commands}.test.ts`
- integration: `tests/integration/events-roundtrip.test.ts`
- Red proven: all new test files failed at import before prod existed.

### Decisions

- `EventId` is opaque and structurally minimal (1..128 printable ASCII); the
  kernel never generates ids, uses no UUID/timestamps/browser crypto.
- `sequence` is kernel-owned (ascending from 1), logical only, no wall-clock
  authority.
- Duplicate handling is a Result, not an error; contract violations throw
  `DomainEventContractError` with a `code`.
- Dedup memory is session-scoped; persistence is a future decision.
- No save/event-log coupling: save stays snapshot-based; no replay hydration.

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

Repository inspection: `src/domain/**` has no Phaser / React / browser API /
IndexedDB imports and no `any`.
