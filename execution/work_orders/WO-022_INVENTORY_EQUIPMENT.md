# WO-022 — Inventory & Equipment

Pure, deterministic inventory/equipment as canonical continuation state, wired
through the effect executor to the dialogue `add_item`/`remove_item` seal and
into save schema v5.

## Scope

- Pure inventory domain (`src/domain/inventory/`): canonical five-slot equipment
  (tool/device/clothing/credential/keepsake), global inventory, generalized
  persisted mutation ledger (`grant|remove|force-remove` per occurrence+item),
  typed failures, read-only projections.
- Save schema v5: `domain.inventory` joined into the authoritative snapshot;
  pure content-independent `v4→v5` migration; strict v5 guard.
- Content compatibility: owned/equipped refs, equipped-implies-owned, authored
  slot match, non-stackable-count rule (assert, never silent drop).
- Application effect executor (`src/application/effects/runtime.ts`):
  `occurrenceId = EffectRequest.instanceId`, no success facts on failed or
  deduplicated requests, no quest/dialogue reducer changes, no `any`.
- Content: sample items (`content/items/*.yaml`) + `zh-CN` localization;
  `ItemManifest.slot/stackable/questProtected` tightening with defaults.
- Out of scope (WO-022): HUD/inventory UI, Phaser pickup indicators, per-PC
  ownership, rank/budget systems (WO-030+/WO-023).

## Implementation Notes

- Contract locked in `specs/features/FS-INV-001.md` (AC-01..AC-13, Rev 1).
  The four plan questions were answered by the maintainer (global inventory,
  refuse over-removal, generalized ledger, exposed-facts-only executor) — see
  the spec Open questions.
- Check order for `removeItem` (spec): ledger dedup → `unknown-item` →
  `negative-dimension` → `quest-protected` → `insufficient-stack` →
  `item-equipped` → mutate. All failures are typed `InventoryError`s and are
  atomic (state untouched); duplicate occurrences return `{ outcome: 'duplicate' }`.
- Quest protection lives in content facts, resolved by the application seam and
  mirrored into the persisted stack at grant time so protection survives reloads
  without reconstructing facts; forced removal is only the separately-named
  `forceRemoveItem` (never a bypass flag on `removeItem`), recording a
  `force-remove` ledger entry.
- Equip invariants: owned positive quantity, canonical slot, content-resolved
  slot compatibility at the load gate; replacing an occupied slot preserves both
  owned stacks; final-unit removal of an equipped item is refused
  (`item-equipped`) — no hidden auto-unequip.
- Executor contracts: application layer only, never owns canonical state, never
  bypasses the replay/idempotency contract; `add_item`/`remove_item` with
  optional `count` (positive integer); skip reasons mirror domain error codes;
  item facts are exactly `item.acquired` / `item.removed`.
- Schema v5 guard is content-independent (item-id grammar via `isContentIdSyntax`,
  canonical slot keys, equipped-implies-owned, positive integer counts, optional
  boolean stack `questProtected`) and v1–v4 validators are byte-identical.
- Content `ItemManifest`/itemSchema tightened with safe defaults so existing
  content stays valid; `validate:content` regenerates the manifest.
- Verification: full `npm run quality` (format, lint, typecheck, unit ×400,
  integration ×34, content validation → 23 docs/1 locale, build) + e2e 6/6 green.

## Verification evidence

- Unit: `tests/unit/inventory/{inventory-domain,equip,purity}.test.ts` +
  `tests/unit/save/schema-v5.test.ts` + inventory section of
  `tests/unit/save/content-compat.test.ts`.
- Integration: `tests/integration/inventory-runtime.test.ts` (executor +
  real dialogue seam + save content gate).
- `npm run quality`: PASS. E2E: 6/6 PASS (reload suite covers inventory hydration
  via the dev harness runtime).

## Close-out (2026-09-02)

### Completed

- Pure inventory domain: `createInventoryState`, `hasItem`, `addItem`,
  `removeItem`/`forceRemoveItem` (shared `performRemove`), `equipItem`,
  `unequipItem`, `toInventoryView`; ledger helpers and 8 typed
  `InventoryErrorCode`s; demonstrations of every frozen invariant.
- Save schema v5: `migrateV4ToV5` seeds canonical empty inventory
  (`corrupt-shape` on unexpected inventory in a v4 snapshot — tested directly);
  `validatePayloadV5`/`validateInventory` strict guard; migrations registry
  frozen to keys `['2','3','4','5']`; v1→v5 chaining proven.
- Application wiring: `SaveDomain.inventory`, `LoadedRecord.runtime.inventory`
  hydration, `ContentCatalog.items` catalog seam, `validateContinuationRefs`
  inventory section (no silent hydration drops).
- Application effect executor (`applyItemEffects`) glued to the dialogue seam
  `instanceId = ${transitionId}:${index}` with exact-once semantics across
  transitions and reloads.
- Content: sample items `item_document_log`, `item_tool_relay_scanner`,
  `item_consumable_notch` + `zh-CN` localization; `ItemManifest`/itemSchema
  tightened (`slot` enum, `stackable`/`questProtected` boolean defaults);
  content-compat and content-pipeline fixtures extended accordingly.
- Version-pinned save tests retargeted to v5 (migrations, schema-v3, schema-v4);
  `content-compat.test.ts` payload builders carry `inventory`.

### Acceptance criteria

- AC-01..AC-13 of FS-INV-001: PASS — tracked in the spec Test plan +
  `tests/unit/inventory/*`, `tests/unit/save/schema-v5.test.ts`,
  `tests/unit/save/content-compat.test.ts`, `tests/integration/inventory-runtime.test.ts`,
  `tests/unit/content/manifest.test.ts`, `tests/integration/content-pipeline.test.ts`.
  All listed Red TDD cases existed as red before implementation and are green now.

### Verification

- `npm run quality`: PASS (format, lint, typecheck, 400 unit + 34 integration
  tests, `validate:content` → 23 docs/1 locale, build).
- E2E: 6/6 PASS (boot + reload suites).

### Files changed

- `src/domain/inventory/{types,runtime,index}.ts` (new), `src/domain/index.ts`
- `src/domain/save/{types,migrations,guards}.ts` (schema v5)
- `src/application/save/{save-service,loadPipeline,ports,contentCompatibility}.ts`
- `src/application/effects/{types,runtime,index}.ts` (new)
- `src/domain/content/types.ts`, `schemas/content/entities.ts`
- `src/dev/{manifests,harness}.ts`, `tests/helpers/save-fixtures.ts`
- `tests/unit/inventory/*` (3 new), `tests/unit/save/{schema-v5 (new),migrations,schema-v3,schema-v4,content-compat,pipeline}.test.ts`,
  `tests/integration/inventory-runtime.test.ts`, `tests/unit/content/manifest.test.ts`
- `content/items/*` (3 new), `content/localization/zh-CN/items.yaml`,
  `content/generated/manifest.json`
- `specs/features/FS-INV-001.md`, `execution/work_orders/WO-022_INVENTORY_EQUIPMENT.md`,
  `execution/TRACEABILITY_MATRIX.md`

### Why / What / Migration / Player impact / Risks

- **Why**: inventory/equipment is canonical continuation state — needed before
  any pickup/economy content; contracts were frozen at the WO-022 plan review.
- **What**: pure domain + schema v5 + content-compat gate + application effect
  executor; no HUD/UI, no Phaser mutation, no quest reducer changes.
- **Migration**: v1→v5 auto-migrates; v4→v5 seeds an empty canonical inventory.
  Existing saves load unchanged and byte-identical.
- **Player impact**: none visible yet (pickups/UI land with WO-030/WO-040); a
  prior v4 save gains an empty inventory on first load.
- **Risks**: quest-protection is per-stack (content-resolved at grant);
  stack merging keeps protection sticky — acceptable and covered by tests; the
  inventory module adds no third-party deps. `ContentCatalog.items` is a
  catalog-seam breaking change confined to fixtures/dev + tests.

### Next allowed Work Order

- WO-023 (Relationship/Medal/Codex), or a UI/handoff step per gate.