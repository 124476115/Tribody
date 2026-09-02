# FS-SAVE-001 — Save / Load

## Status

Approved for implementation under WO-013 (Rev C). Incorporated the WO-013 Rev A / Rev B /
Rev C plan-review corrections (version-aware validation, create-only immutable records,
finalized checksum body, expanded ContentCatalog, error taxonomy, shared size contract,
import atomicity wording, single-active-tab assumption).

## Problem

A long narrative RPG must never lose progress. The game needs a versioned, snapshot-based
save/load architecture that survives crashes, self-corrupts gracefully, migrates old saves
sequentially, rejects untrusted imported saves, and restores Dialogue + Quest runtime state
exactly. Save correctness must not depend on Phaser, React, or any authoring-era format.

## Player value

Trust that progress is never lost. A corrupted autosave does not destroy the previous one;
a bad or malicious import cannot damage existing slots; a save from an older build loads via
a strict sequential migration chain.

## Scope

### In

- IndexedDB persistence adapter (create-only immutable records + mutable slot pointer docs).
- 3 manual slots, 1 quick slot, 5 rotating autosaves (deterministic rotation).
- `SaveRecord` (immutable, corruption-checked finalized body) + `SaveSlotDoc` (mutable pointer).
- Checksum = SHA-256 over the canonical finalized body; **corruption detection, not
  tamper/authenticity security**.
- Sequential schema migration `v1 -> v2 -> v3` — never `v1 -> latest` custom branches.
  Production ships migrations only for real persisted formats.
- JSON export/import with size, depth, shape, checksum, version, and content gates.
- Corrupted-save rejection and autosave fallback.
- Version-aware load pipeline shared by normal load and import.
- Application-level `SaveService` (semantic save/load/list/delete) as the only surface
  downstream systems (WO-014 / WO-030) depend on.
- Exact restore of `DialogueSavedState` and `QuestSavedState`.

### Out

- Save-menu UI (WO-030), cloud sync, encryption, save editors.
- Engines with no owner yet (flags / inventory / relationship / XP): no payload fields for
  them in v1; they arrive via future schema versions + migration.
- In-game checkpoint *trigger* wiring (WO-014 owns the interaction hooks).
- Event Sourcing / replay-based hydration (binding non-goal, FS-EVENTS-001).
- Any pruning of `processedRequestIds` / `processedEventIds` / runtime histories in the
  save layer (v1 keeps them complete; see Ledger persistence).

## Architecture invariants

1. Save snapshot is authoritative. No replay / re-derivation from events.
2. `SaveRecord` is immutable: created once by `createRecord` (IndexedDB `add`), never
   mutated. A recordId collision is a typed `persistence-collision` error.
3. Atomic write = two-phase: `createRecord` first, verify stored bytes, then `putSlot`
   pointer. Interrupted writes leave the previous valid recorded save intact.
4. The entire finalized body (schemaVersion, contentVersion, gameVersion, createdAt,
   payload) is inside the checksum. `schemaVersion` / `contentVersion` are not mutable
   unprotected metadata.
5. Only genuinely mutable slot state lives in `SaveSlotDoc` (updatedAt, loadIssue, meta).
6. Loading follows: `parse -> header shape -> checksum -> version-specific validation ->
   sequential migration -> latest validation -> hydrate -> (persist migrated record)`.
7. `unsupported-schema` (checksum-verified newer save) is NOT corruption and is never
   marked as such.
8. Content incompatibility is explicit and never silently accepted.

## Data contract

### SaveRecord (immutable, corruption-checked)

```ts
interface SaveRecord {
  schemaVersion: number;            // inside checksum
  contentVersion: string;           // inside checksum
  gameVersion: string;              // inside checksum; informational only
  createdAt: number;                // inside checksum; epoch millis when the snapshot was captured
  checksum: string;                 // sha-256 hex over canonical bytes of the finalized body
  payload: SavePayload;
}
```

Finalized body (frozen contract, version-independent for checksum verification):

```ts
{SchemaVersion, contentVersion, gameVersion, createdAt, payload}
// canonical := stringifyCanonical(extractChecksumBody(record))
```

The checksum-body extraction is **forward-compatible by contract**: it reads exactly the
five frozen fields (stable order, sorted keys) and ignores any unknown top-level fields
present in a future-version record, so a newer save's stable prefix can still be
integrity-checked before it is classified `unsupported-schema`.

### SaveSlotDoc (mutable pointer)

```ts
interface SaveSlotDoc {
  slotId: SaveSlotId;               // 'manual-1'|'manual-2'|'manual-3'|'quick'|'auto-1'..'auto-5'
  kind: 'manual' | 'auto' | 'quick';
  recordId: string;
  updatedAt: number;                // last real save into the slot; never touched by migration
  loadIssue: { recordId: string; code: SaveErrorCode; detectedAt: number } | null;
  meta: SaveSummaryMeta;            // schemaVersion, contentVersion, gameVersion, createdAt,
                                    // activeChapterId, activeSceneId, playtimeMinutes
}
```

- `createdAt` = snapshot capture time (immutable, in the record). `updatedAt` = slot touch
  time (in the doc). Schema migration preserves both the original `createdAt` and the slot
  `updatedAt`, so migrating autosaves never reorders them.
- `loadIssue`: set only for `corrupt-*` codes, or with its distinguishing `code` for
  `unsupported-schema` / `content-incompatible`; recorded load issues never auto-delete the
  underlying immutable record.

### SavePayload

```ts
interface SavePayload {
  activeChapterId: string;
  activeSceneId: string;
  checkpoint: { chapterId: string; sceneId: string; scope: 'chapter_enter'|'autosave'|'manual'|'quick' } | null;
  playtimeMinutes: number;
  domain: {
    dialogue: DialogueSavedState;   // exact runtime restore
    quest: QuestSavedState;         // exact runtime restore
  };
}
```

## Version-aware validation & migration pipeline (load and import share it)

```
1. parse          guarded JSON.parse                              -> corrupt-json
2. header shape   generic JSON-safety + depth + dangerous-key
                  rejection + stable checksum-header shape only.
                  NO payload/latest key whitelist here (else a
                  newer save dies before checksum).              -> corrupt-shape
3. checksum       sha-256(canonical(finalized body))            -> corrupt-checksum
4. payload @ v    version-specific strict guard for schemaVersion v
                  (whitelisted keys belong here, after checksum) -> corrupt-shape
5. migration      sequential s -> s+1 -> ... -> TARGET           -> missing-migration
6. payload @ latest strict latest guard on migrated payload      -> corrupt-shape
7. hydrate        reconstruct Dialogue/Quest runtime; validate
                  continuation refs vs ContentCatalog            -> content-incompatible
8. persist-migrated (iff 5 applied) createRecord + putSlot of the migrated record;
                  failure is surfaced as a warning, never blocks play
```

- `SAVE_SCHEMA_VERSION = 1` in v1. Production `migrations.ts` ships registry entries only
  for real persisted formats (v1 ships an empty registry). Sequential migration plus
  version-specific guards are exercised via an injected test-only registry/harness.
- A checksum-verified record with `schemaVersion > TARGET` is `unsupported-schema`
  (loadable only by a newer build). `schemaVersion` missing/non-integer is `corrupt-shape`.
- Version-specific strict payload guard (`PAYLOAD_GUARDS[v]`) and migration step run only
  after checksum verification; the latest guard never runs before migration.

## Content compatibility & continuation-critical validation

The loader receives a `ContentCatalog` built from the current content manifest:

```ts
interface ContentCatalog {
  contentVersion: string;
  chapters: Record<string, { entrySceneId: string }>;
  scenes: Record<string, { chapterId: string }>;
  dialogues: Record<string, { entryNode: string }>;
  nodes: Record<string, Record<string, { choices: { id: string; skillCheck?: unknown }[] }>>;
  quests: Record<string, { objectiveIds: string[] }>;
}
```

Rules at hydrate (all strict, all `content-incompatible`):

- `record.contentVersion` equals the catalog version or is listed in `COMPAT_MAP`.
- `activeChapterId` exists; `activeSceneId` exists **and** belongs to `activeChapterId`.
- Every `questId` in `payload.domain.quest.quests` exists in the catalog, and every
  objective id declared by that quest's manifest objectiveIds is present in the persisted
  objective state (continuation of `questApplyEvent` matches against `manifest.objectives`).
  Persisted statuses are structurally valid `QuestStatus` values.
- Active dialogue session: `dialogueId` exists; `nodeId` exists; if parked in
  `awaitingSkillCheck`, the pinned choice exists on that node and declares `skillCheck`.
- Historical observability-only `history` entries (dialogue and quest) may reference stale
  content ids; they are never consulted for continuation.

Content-set evolution (objectives/nodes authored away) is surfaced as
`content-incompatible`, never auto-fixed (content migration is out of WO-013 scope).

## Error taxonomy

```ts
type SaveErrorCode =
  | 'corrupt-json' | 'corrupt-shape' | 'corrupt-checksum'
  | 'unsupported-schema' | 'missing-migration'
  | 'content-incompatible'
  | 'save-oversize'
  | 'persistence-error' | 'persistence-quota' | 'persistence-collision' | 'slot-not-found'
  | 'import-oversize' | 'import-malformed';
```

Guarantees:

- A valid newer-version save is `unsupported-schema`, never `corrupt-checksum`
  (checksum verifies first).
- Content mismatch is `content-incompatible`, never corruption.
- `save-oversize` is emitted at the `SaveService` boundary as a typed error; size
  assertions never escape as bare throws.
- Application/UI boundaries never receive bare throws — only `SaveError` / typed results.

## Size contract (self-consistent)

`MAX_SERIALIZED_SAVE_BYTES` (default 64 MiB) is a single constant used by:

1. `assertSaveSize` in save construction — a too-large legitimate save is a typed
   `save-oversize` build/engine error;
2. the export pre-guard;
3. the import pre-guard (`import-oversize`).

Invariant: every save this build can produce/export is importable under this build's cap.
Import additionally rejects excess nesting depth (`MAX_NESTING_DEPTH`, default 64) and
dangerous keys (`__proto__`, `constructor`, unknown-key object smuggling).

## Import / export security

Export = pretty-printed JSON of `SaveRecord` (checksum over canonical finalized body;
integrity only, not authenticity).

Import gates, all shared with the normal pipeline from stage 2 onward; storage is written
only after the whole pipeline passes:

1. byte size <= `MAX_SERIALIZED_SAVE_BYTES` -> `import-oversize`;
2. guarded parse -> `import-malformed`;
3. header shape + depth + dangerous-key -> `import-malformed` / `corrupt-shape`;
4. checksum -> `corrupt-checksum`;
5. version-specific @ v -> `corrupt-shape`;
6. migration (iff s < TARGET);
7. latest validation;
8. content compat + continuation refs -> `content-incompatible`;
9. `createRecord` + `putSlot` at destination.

**Import atomicity guarantee (accepted wording):** failed imports leave the destination
slot pointer and all user-visible state unchanged. Any record created before a pointer-write
failure is an unreferenced orphan eligible for garbage collection (best-effort delete is
attempted). This is weaker than "byte-for-byte untouched storage" and is the exact guarantee
the two-phase protocol provides.

## Atomicity

- `createRecord` uses IndexedDB `add` semantics: overwriting an existing recordId is a
  typed `persistence-collision`; an existing pointed record can never be modified, only
  replaced by repointing its slot.
- Two-phase commit: create record, re-read + recompute checksum + latest guard on stored
  bytes, then update slot pointer. Crash between phases leaves the pointer on the previous
  valid record; orphans are reclaimed by a deferred GC pass (unreferenced, older than a
  retention window).
- Cross-tab note: checksum detects record corruption, NOT a lost last-writer-wins slot
  pointer update. Single-active-tab is the documented accepted assumption (debt).

## Slots / autosaves

- 3 manual, 1 quick, 5 rotating autosaves.
- Autosave rotation: when 5 autosave slots exist, the next autosave replaces the slot with
  the smallest `(updatedAt, slotId)` — slotId makes tie-breaking deterministic. Migration
  never touches `updatedAt`, so migrated autosaves keep chronological order.
- Corrupt newest autosave falls back through remaining autosaves by `(updatedAt, slotId)`
  (AC-03); manual/quick corruption is surfaced per-slot without affecting other slots.

## Ledger persistence decision

Do **not** prune `processedRequestIds`, `processedEventIds`, or runtime histories in the
save layer. Rationale (operational, not a correctness theorem):

- Exact restore + byte determinism require identical restored runtime state.
- Pruning request/event ledgers reopens exact-once holes: redelivered old ids would look
  fresh after truncation (double effects / double quest progress).
- In-session growth is operationally small (distinct accepted commands; progressing
  occurrences — a tracked id never re-progresses).

Guards: the shared size contract (§Size) turns runaway growth into a typed
`save-oversize` at save time; a warn threshold surfaces abnormally large payloads.
Any future truncation must be a schema migration (e.g. v2 `historyWindow`) that keeps dedup
ledgers complete — no arbitrary truncation path exists in v1.

## Acceptance

- AC-01 — Round-trip preserves exact Dialogue + Quest domain invariants (mid-conversation
  node, pending skill check, request/event ledgers, statuses, objective progress,
  ordinals, histories).
- AC-02 — Migration chain is sequential (`s -> s+1 -> ... -> TARGET`); no
  `v1 -> latest` path exists. Old-schema-valid / latest-schema-invalid input migrates
  successfully because the latest guard runs only after migration.
- AC-03 — A corrupted current (newest) autosave falls back to the previous valid autosave.
- AC-04 — Imported files are fully validated before storage; a failed import leaves the
  destination slot and user-visible state unchanged (orphan records eligible for GC).
  Unsupported/malformed/oversized/checksum-invalid inputs fail with typed errors and never
  overwrite existing saves.
- AC-05 — Old content IDs / versions are handled by an explicit compat map; unresolved
  content references fail as `content-incompatible` rather than loading silently.

## Module surface

```ts
// src/domain/save (pure TS)
SAVE_SCHEMA_VERSION, MAX_SERIALIZED_SAVE_BYTES, MAX_NESTING_DEPTH
SaveRecord, SavePayload, SaveSlotDoc, SaveSummary, SaveSlotId, SaveSlotKind
SaveError, SaveErrorCode, SaveWarning, LoadOutcome
stringifyCanonical(value): string
extractChecksumBody(recordRecord): ChecksumBody
assertJSONShape (depth/dangerous-key walk)
validatePayloadForVersion(v, payload)
applyMigrations(registry, s, target, payload): { payload, applied: number[] }
Migrations (production registry; empty at v1)

// src/application/save
SaveService {
  listSlots(): Promise<SaveSummary[]>;
  saveToSlot(slot, domain, ctx): Promise<SaveResult>;
  quickSave(domain, ctx): Promise<SaveResult>;
  autosave(domain, ctx): Promise<SaveResult>;
  loadSlot(slot): Promise<LoadOutcome>;
  deleteSlot(slot): Promise<SaveResult<void>>;
  exportSave(slot): Promise<SaveResult<string>>;
  importSave(text, destSlot): Promise<SaveResult>;
}
PersistencePort, Checksummer, Clock, ContentCatalog  (ports)
loadPipeline, atomicWrite, slotPolicy, contentCompatibility

// src/adapters/persistence
IndexedDBPersistence (create-only `add` semantics)
sha256Hex (WebCrypto)
exportFile / importFile (size pre-guard)
```