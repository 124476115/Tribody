# WO-013 — Save System

Spec: `FS-SAVE-001` (Rev C).

## Implement

- IndexedDB adapter with create-only immutable `SaveRecord`s (`add` semantics) and mutable
  `SaveSlotDoc` pointers.
- Envelope/record finalized-body checksum (SHA-256 over canonical body; corruption
  detection only).
- 3 manual slots, 1 quick slot, 5 rotating autosaves (deterministic `(updatedAt, slotId)`
  rotation).
- Version-aware load pipeline (parse -> header -> checksum -> version-specific ->
  migration -> latest -> hydrate) shared by normal load and import.
- Sequential migration framework: production registry empty at `SAVE_SCHEMA_VERSION = 1`;
  migration steps exist only for real persisted formats; sequential behavior testable via
  an injected test-only registry.
- JSON export/import with size/depth/shape/checksum/version/content gates; typed
  `import-oversize` / `import-malformed`; failed imports leave destination slot unchanged.
- Corrupted-save fallback (newest autosave -> previous valid).
- ContentCatalog continuation-critical referential validation (chapter/scene, quest
  objective identity, active dialogue node + pinned skill check; observability history may
  go stale).
- Application `SaveService` semantic surface (list/save/quick/auto/load/delete/export/import).
- Error taxonomy: corrupt / unsupported-schema / content-incompatible / persistence /
  import / save-oversize — never bare throws at application/UI boundaries.
- `LoadOutcome` exposes `warnings` (e.g. migration-persist failure) on `status: 'ok'`.
- Docs updates: `docs/16` replaces `SaveRepository` with `PersistencePort` + `SaveService`;
  `SaveSlotId` real definition; TRACEABILITY_MATRIX row.

## Non-goals (carried from spec)

- No pruning of ledgers/histories in the save layer (full retention).
- No event sourcing / replay hydration.
- No save-menu UI (WO-030) or checkpoint trigger wiring (WO-014).
- No flags/inventory/relationship/XP payload fields (no owning engine yet).
- No cloud sync / encryption / save editors.

## Tests

- Unit (`tests/unit/save/*.test.ts`): canonical determinism; guards (v1 strict / forward
  header); checksum corruption + finalized-header corruption; unsupported-schema vs
  corrupt-checksum; sequential migration fixture (injected registry, spy order, missing
  step, no jump); old-schema-valid migrates; record-ID collision immutability; content
  compat (chapter/scene, quest objective identity, dialogue refs, pending skill check,
  stale history); taxonomy; size-constant cap consistency; depth/dangerous-key import
  rejection; atomicity (interrupted write / previous-valid fallback / orphan GC eligibility);
  rotation; manual slot isolation; quick overwrite; import/export round-trip; migration
  warning on persist failure; domain purity.
- Integration (`tests/integration/save-roundtrip.test.ts`): full pipeline over a
  `MemoryPersistence` with create-only semantics + fault switches.
- E2E (`tests/e2e/reload.spec.ts`): real bootstrap -> real `SaveService` (dev-hook)
  -> `page.reload()` -> real load/hydrate path asserts restored runtime state.

## Acceptance trace

| FS-SAVE AC | Test |
| ---------- | ---- |
| AC-01 | `tests/unit/save/*.test.ts` roundtrip; `tests/integration/save-roundtrip.test.ts`; `tests/e2e/reload.spec.ts` (save/reload/restore) |
| AC-02 | `tests/unit/save/migrations.test.ts`, `pipeline.test.ts` |
| AC-03 | `tests/unit/save/save-service.test.ts` fallback + corrupt-autosave `loadBestAutosave`; `tests/e2e/reload.spec.ts` (empty slot) |
| AC-04 | `tests/unit/save/import-export.test.ts`, `save-service.test.ts` |
| AC-05 | `tests/unit/save/content-compat.test.ts` |

## Implementation notes (post-implementation)

- Green path implemented as: `src/domain/save` (types/errors/canonical/guards/migrations),
  `src/application/save` (ports/recordBuild/loadPipeline/contentCompatibility/slotPolicy/
  atomicWrite/importExport/save-service), `src/adapters/persistence` (checksum/indexeddb/
  fileIO). Barrel `src/domain/save/index.ts` and `src/application/save/index.ts` re-export
  the public types; the application barrel re-exports domain types used by tests
  (`MigrationRegistry`, `SaveError`, etc.).
- Load pipeline order (final): parseJSON -> extractHeader (forward-compatible) ->
  extractHeaderExtras -> checksum over `recordBodyText({schemaVersion, contentVersion,
  gameVersion, createdAt, payload})` -> `unsupported-schema` when `schemaVersion > target`
  (never corruption) -> version-specific guard at the RECORDED version -> sequential
  `applyMigrations` -> guard at target (only when target != recorded) -> content compat ->
  finalizeRecord -> hydrate.
- Migration steps keyed by the version they PRODUCE: migrating `from -> to` walks
  `ensureStep(registry, v)` for `v = from+1 … to`. Production registry is `Object.freeze({})`
  at v1; sequential behavior is proven against an injected registry.
- `assertJSONShape` operates on an already-parsed value (not a string). Dangerous keys
  (`__proto__`/`constructor`/`prototype`) and nesting > `MAX_NESTING_DEPTH` (64) are
  rejected; this stage is key-agnostic so unknown future keys tolerate the header stage.
- Stored IndexedDB documents carry `recordId` injected by `createRecord` (the store keyPath
  is `recordId`; `SaveRecord` itself has no id — the id lives on `SaveSlotDoc`).
- Import remap: `corrupt-json`/`corrupt-shape` -> `import-malformed`; other codes pass
  through; no other codes are remapped. Size gate runs before parsing
  (`import-oversize`); export re-serializes the same canonical bytes.
- SaveService never throws across its boundary: typed results only. `loadIssue`
  (`{code, message}|null`) is recorded per slot without failing the next fresh save;
  migration-persist on load is best-effort and surfaces as a warning on `status: 'ok'`.
- Strict tsconfig was exercised heavily: bracket access on index-signature objects,
  `exactOptionalPropertyTypes` (conditional guard-options spread), `noUnusedParameters`
  (prefixed `_`), and eslint `restrict-template-expressions` (numbers stringified with
  `String(...)`).
- Dev-only E2E harness lives in `src/dev` (aliased `@dev/*` in tsconfig + vite): it installs
  `window.__trisolaris` under `import.meta.env.DEV` and drives the REAL runtimes to a
  deterministic `awaitingSkillCheck` + two advanced quests. E2E-only concern; production
  bundle is unaffected.
- The v1 quest history `resolution` is a QuestResolution object
  (`{ onAllRequiredComplete }`), not a bare string — the v1 guard validates it as such.
- The companion fixture quest `q_watched` resolves to `resolved_success` after the shared
  `evt-shared` event (single required objective completes); tests assert that status.

### Post-review resolutions (Reviewer Gate)

1. **AC-03 application-level fallback is implemented in `SaveService`, not the UI.** New
   `SaveService.loadBestAutosave()` walks autosave slots **newest-first in deterministic
   `(updatedAt, slotId)` order**, skipping `loadIssue`-marked and discovered-corrupt slots
   until the first valid autosave, and returns that runtime; all-corrupt / none →
   typed `slot-not-found`. Proven red-first in `tests/unit/save/save-service.test.ts`:
   newest-corrupt → next-newest valid; several corrupt → newest still-valid; equal
   `updatedAt` ties break by higher `slotId` as newest; all corrupt → `slot-not-found`;
   none → `slot-not-found`. WO-030 only owns *presentation* of this fallback.
2. **WO-002 save-slot stub replaced.** `src/domain/events/types.ts` now aliases the real
   `SaveSlotId` (`export type SaveSlot = SaveSlotId`; type-only import, single source of
   truth). `tests/unit/events/save-slot.test.ts` enforces bidirectional type equality.
   `docs/16_TECHNICAL_CONTRACTS.md` documents the seam; no competing definitions remain.
3. **AC-04 pointer-write failure is fault-injected.** `tests/unit/save/save-service.test.ts`
   covers import (and save) where `createRecord` succeeds but `putSlot` fails: destination
   pointer unchanged, prior record byte-identical, typed `persistence-error`; when the
   best-effort orphan delete also fails the new record is proven unreferenced/orphan-only
   (no byte-for-byte untouched claim); when it succeeds no orphan remains. Added
   `failNextDeleteRecord` fault to `tests/helpers/memory-persistence.ts`.

### Work Order Gate

- Statutory workflows satisfied: Spec/contracts (FS-SAVE-001 Rev C, `docs/16`) exist before
  tests; Red tests existed before Green implementation; unit/integration/E2E all green;
  no third-party deps added (integration uses `MemoryPersistence` per the work order;
  IndexedDB exercised only in browser E2E).

## Design-impact

- Replaces `SaveRepository` port in `docs/16_TECHNICAL_CONTRACTS.md`.
- Adds the real `SaveSlotId` union in `src/domain/save`. The WO-002 `SaveSlot = string`
  stub and `GameCommand.slot` stay unchanged (WO-002 does not import the save domain;
  `SaveSlotId` is assignable to `SaveSlot`).