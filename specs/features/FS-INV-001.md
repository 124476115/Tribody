# FS-INV-001 — Inventory & Equipment

## Status

**Approved with required contract patches (WO-022 plan review)** — decisions
frozen by the maintainer before Red TDD. Boundaries from the WO-021 review are
adopted: inventory/equipment owns item possession and equip state; Skills may
consume item-derived numeric modifiers but must not own item state; Progression
attributes remain Progression-owned; canonical inventory state evolves the Save
schema (never UI/Phaser state); no equipment effects are added directly inside
Dialogue/Quest reducers.

Contract patches frozen in Rev 1: generalized persisted ledger, explicit
equipped-removal rule, strict equip invariants, stack invariants,
quest-protection enforcement contract, executor no-false-fact rule, content
compatibility validation (no silent hydration drops), schema v5 approval
(global inventory confirmed).

## Problem

The game has item content (`ItemManifest`, `add_item`/`remove_item` effects,
`has_item` conditions) but **no owned item state**: there is no canonical,
persisted record of what the player possesses, no stacks, no equipment slots,
and nothing protects quest-critical items. Dialogue/quest content that grants
or checks items therefore cannot be authored truthfully, and any item state
that emergency-implemented in UI/Phaser would violate the canonical-state rule.

## Player value

The player's carried things are legible and durable (docs/15: 8–16 meaningful
items, no trash loot, evidence lives on the Investigation Board). Equipping a
tool, device, clothing item, credential, or keepsake is a repeatable, saved act;
quest-critical items can never be involuntarily lost; a reload restores exactly
the same inventory.

## Scope

### In

- Pure inventory domain `src/domain/inventory/` (no Phaser, React, Zod, browser,
  or Node.js built-ins; no imported RNG — fully deterministic).
- Canonical persisted envelope `InventorySavedState` (schema v5): owned stacks
  `items: Record<ItemId, ItemStack>`, `equipped: Partial<Record<EquipmentSlot, ItemId>>`,
  and a **generalized persisted mutation ledger**
  `ledger: string[]` (see "Ledger" below).
  **Global** inventory (the crew/toolbox), matching `GameSnapshot.inventory` and
  the `inventory/equip { itemId }` command (which carries no pcId). No implicit
  PC ownership unless a future requirement explicitly changes the game model.
- Domain-owned frozen slot enum
  `EQUIPMENT_SLOTS = ['tool', 'device', 'clothing', 'credential', 'keepsake']`.
- **Generalized ledger** — persists BOTH grant and removal origins so replay is
  fully idempotent, not acquisition-only:

  ```
  ledger entry := `${operation}:${occurrenceId}:${itemId}`
  operation ∈ { grant, remove, force-remove }
  ```

  Collision-safe by construction (`operation` prefix); the `occurrenceId` is the
  producer-owned stable one (application uses the dialogue `EffectRequest`
  `instanceId` = `${transitionId}:${index}`, deterministic across reloads).
  Required semantics:
  - the same logical add occurrence never adds twice (ledger survives reload);
  - the same logical remove occurrence never removes twice;
  - distinct legitimate occurrences for the same item remain independent;
  - dedup survives save/reload (the ledger rides inside `domain.inventory`).
- **Unique / stackable**: unique items are single instances (count 1);
  stackable items carry small positive integer counts. `ItemStack.count >= 1`
  only; **zero quantity means the key is absent, never `{ count: 0 }`**;
  **non-stackable items can never exceed quantity 1** (domain refuses a grant of
  `count > 1` for a non-stackable fact; structural positivity is enforced by the
  v5 guard; `stackable` metadata correctness is enforced by content-compat).
- `addItem` / `removeItem` / `forceRemoveItem` (typed outcomes), `hasItem` for
  conditions.
- **Quest item protection**: ordinary `removeItem` on a quest-protected item is
  refused with a typed `quest-protected` error; the protection flag is
  content-owned on `ItemManifest` and arrives at the domain as a producer Fact.
  Forced/scripted removal is a **separately named operation** (`forceRemoveItem`),
  never a boolean bypass flag threaded through ordinary removal.
- **Equip / unequip**: `equipItem(state, fact)` requires the item to be owned
  (positive quantity), the caller to supply the item's slot (content-resolved
  fact), membership in the frozen enum; one item per slot, an occupied slot is
  replaced and the previous item returns to inventory. Equip is deterministic
  and idempotent (re-equipping the same item to its current slot = no-change).
  Replacing never alters possession quantities.
- **Equipped final-unit rule (frozen)**: `removeItem` that would drop the final
  owned unit of an **equipped** item is refused with typed `item-equipped`; the
  caller must explicitly `unequipItem` first. Removing quantity while the
  resulting stack stays `> 0` is allowed and leaves `equipped` untouched.
  `removeItem` never performs a hidden auto-unequip (removal must not create an
  unrelated equipment mutation implicitly).
- **Content-first metadata seam**: `ItemManifest` gains optional
  `slot?: EquipmentSlot`, `stackable?: boolean` (default false),
  `questProtected?: boolean` (default false). Item metadata is CONTENT-owned;
  the domain receives `slot` as a runtime fact. Shape-level invariants are
  content-independent and enforced by the v5 save guard; slot/stackability
  membership is enforced by the content schema and by continuation-ref
  validation (equipped items must exist and carry the matching slot).
- Save schema v5 (`domain.inventory`) + real pure v4→v5 migration (seeds empty
  inventory/equipment/ledger; content-independent) + strict v5 structural guard
  (v1–v4 validators unchanged; unexpected `domain.inventory` in a v4 snapshot →
  `corrupt-shape`).
- Content-compat extension (`validateContinuationRefs`, at load): every owned
  `itemId` exists in the current content catalog; every equipped `itemId` exists
  AND is currently owned; every equipped slot is canonical; the item's authored
  slot is compatible with the persisted slot. **No silent hydration drops** —
  invalid equipment is a hard assert, never quietly cleared.
- Content schema tightening for `item` (slot enum, boolean flags with defaults);
  authored items migrated in the same WO; content validation stays green.
- **Application effect executor** (application layer, NOT inside dialogue/quest
  reducers): applies `add_item` / `remove_item` `EffectRequest`s to the
  inventory domain and returns the resulting item facts (`item.acquired`,
  `item.removed`) for quest listeners — the concrete cross-system integration
  that owns this seam.
  Executor contracts (frozen): it must not own canonical inventory state (the
  domain does); must not directly modify Quest/Dialogue state; must not emit a
  successful item fact when the Inventory mutation failed or deduplicated; must
  not bypass Inventory's replay/idempotency contract (every request routes
  through the domain reducers with `occurrenceId = EffectRequest.instanceId`).
  Facts carry `occurrenceId` for quest listeners.
- **Read-only projection** `toInventoryView(state)` supplying `InventoryView`
  for future HUDs; never returns mutable domain objects.
- Unit tests (`tests/unit/inventory/`), schema v5 tests
  (`tests/unit/save/schema-v5.test.ts`), content tests, integration test
  (`tests/integration/inventory-runtime.test.ts`), full save compatibility
  suite re-run.

### Out (later WOs)

- React inventory/HUD screen, drag/drop, quick-slot UI → WO-030 (only the
  read-only projection ships here).
- **Item-derived skill-check modifiers**: the frozen WO-021 `SkillCheckInput`
  is NOT reopened; consuming equipped-item bonuses would flow through the
  existing numeric bonus inputs via a later WO (WO-024/WO-040) — the inventory
  domain exposes equipped state as a read-only projection for that consumer.
- Diablo-style affix/rollable item stats (explicitly excluded by WO-022).
- Consumable usage commands, weight/encumbrance, trading, dropping, crafting.
- Per-PC / multi-crew inventory — **decided: global**; revisit only if a future
  requirement explicitly changes the game model.
- Dropping/selling quest-protection policy beyond "cannot be removed".

## User flow

1. Content grants an item (dialogue effect `add_item`, quest reward, exploration
   milestone) with a stable `occurrenceId`.
2. Application effect executor calls `addItem`; unique items appear once,
   stackable items increment; replay credits nothing.
3. Player equips from the inventory: `equipItem(state, { itemId, slot })`.
   Owned + valid slot → `equipped[slot] = itemId`. Replacing dismounts the
   previous item back into the backpack.
4. `has_item` conditions gate choices; quest listening consumes
   `item.acquired`/`item.removed` facts.
5. A quest-critical item can never be removed (typed `quest-protected` refusal).
6. Save persists `InventorySavedState` as `domain.inventory` (schema v5);
   reload round-trips byte-stable.

## Domain model

All contracts live in `src/domain/inventory/` (pure TypeScript).

```ts
const EQUIPMENT_SLOTS = ['tool', 'device', 'clothing', 'credential', 'keepsake'] as const;
type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

interface ItemStack { itemId: string; count: number; }        // count >= 1 integer; zero = key absent

interface InventorySavedState {
  items: Record<string, ItemStack>;          // keyed by itemId (opaque here; grammar via guard)
  equipped: Partial<Record<EquipmentSlot, string>>; // -> owned itemId
  ledger: string[];                          // `${operation}:${occurrenceId}:${itemId}`; grant | remove | force-remove
}
```

### Runtime functions

```ts
function createInventoryState(): InventorySavedState;
function addItem(state, fact: GrantItemFact): AddItemResult;       // 'added' | 'stacked' | 'duplicate'
function removeItem(state, fact: RemoveItemFact): RemoveItemResult; // 'removed' | 'depleted' | 'duplicate' | typed errors
function forceRemoveItem(state, fact: RemoveItemFact): RemoveItemResult;  // scripted bypass of quest-protected, still ledged
function hasItem(state, itemId: string, count?: number): boolean;
function equipItem(state, fact: EquipFact): EquipResult;           // 'equipped' | 'replaced' | 'no-change' | errors
function unequipItem(state, fact: UnequipFact): UnequipResult;     // 'unequipped' | 'not-equipped' | errors
function toInventoryView(state): InventoryView;                    // read-only projection
```

Facts:

```ts
interface GrantItemFact { itemId: string; occurrenceId: string; stackable: boolean; count?: number; questProtected?: boolean; }
interface RemoveItemFact { itemId: string; occurrenceId: string; count?: number; questProtected?: boolean; }
interface EquipFact { itemId: string; slot: EquipmentSlot; }
interface UnequipFact { slot: EquipmentSlot; }
```

`stackable|questProtected|slot` arrive as producer facts (content-owned); the
domain enforces invariants (stack cap, protection, equipped-final-unit rule)
without knowing item content. `forceRemoveItem` shares `RemoveItemFact` but
skips the `quest-protected` refusal and records a `force-remove` ledger entry.
On unsupported/bad facts: `negative-dimension` (invalid count),
`non-stackable` (non-stackable grant with count > 1),
`quest-protected`, `item-equipped` (final-unit removal while equipped),
`insufficient-stack` (atomic — no partial clip), `invalid-slot`, `not-equipped`.
(The Producer resolves authored `slot`/`stackable`/`questProtected` from the
manifest before calling the domain; domain errors cover structural violations.)

## State machine

- **addItem**: `grant:occ:item` already in ledger → `duplicate`, no mutation.
  Otherwise `count > 1 && !stackable` → `non-stackable` (atomic, no mutation).
  Unique → insert `count 1` → `added`; stackable → add `count` (default 1) →
  `stacked`. Ledger gains `grant:occ:item` only on a real mutation.
- **removeItem**: `remove:occ:item` already in ledger → `duplicate`, no
  mutation. Not owned → `unknown-item`. Invalid request count →
  `negative-dimension`. `fact.questProtected === true` → `quest-protected`.
  Requested > owned → `insufficient-stack` (atomic — never a partial clip). Is
  the item currently equipped AND would the removal consume the final owned unit
  → `item-equipped` (atomic). Otherwise reduce; reaching 0 removes the entry →
  `depleted`; else `removed`; ledger gains `remove:occ:item`.
- **forceRemoveItem**: identical to `removeItem` but skips the
  `quest-protected` refusal and records `force-remove:occ:item`. Still respects
  the `item-equipped` final-unit rule and `insufficient-stack`. A forced removal
  is an explicit, scripted, separately-named operation — never a bypass flag on
  ordinary removal.
- **equipItem**: unknown item → `unknown-item` (requires owned, positive
  quantity); slot not in the frozen 5 → `invalid-slot`; item already on that
  slot → `no-change`; occupied → previous item returns to backpack, possession
  quantities untouched, set → `replaced`; free → `equipped`.
- **unequipItem**: nothing on slot → `not-equipped`; else clear → `unequipped`.

Every mutation is atomic: on failure, state and ledger are unchanged (returned
next state === input state). No RNG, no wall-clock; every transition is derived
solely from current state + the fact (reload-stable).

## Inputs / outputs

- Inputs: the pure function calls above; application passes content-resolved
  metadata (`slot`, `stackable`, `questProtected`) and stable producer-owned
  `occurrenceId`.
- Outputs: next immutable `InventorySavedState`, typed outcome discriminants,
  and (for the executor) `item.acquired`/`item.removed` draft facts (no
  `sequence`; the WO-002 kernel assigns those).

## Data contract

### Save schema v5

`SavePayload.domain` gains:

```ts
inventory: InventorySavedState; // { items, equipped, ledger }
```

- v4→v5 migration `migrateV4ToV5` seeds `createInventoryState()` (pure,
  content-independent); v4 snapshots containing `domain.inventory` →
  `corrupt-shape`. Migration must leave dialogue/quest/exploration/progression/
  skills entirely unchanged.
- v5 guard (content-independent) validates: `items` values have `itemId === key`,
  `count` positive finite integers only; `equipped` keys ∈ 5-slot enum; `equipped`
  values ⊆ `items` keys; `ledger` a string array (grammar
  `^(grant|remove|force-remove):[^:]+:[^:]+$`). Item-id grammar
  (`item_<category>_<slug>`) via the shared content helper.
- Content-compat (content-dependent, at load): every owned item id resolves in
  the manifest; every equipped item id exists in the manifest AND is currently
  owned AND the item's authored `slot` is compatible with the persisted slot;
  canonical slots guaranteed structurally. Invalid equipment is NEVER silently
  dropped — `assertContinuationRefs` throws.
- `stackable`/`questProtected` structural correctness is content-compat's job
  (not the version guard's); the guard checks shape, not item semantics.

### Content schema (item)

```yaml
id: item_<category>_<slug>
category: <plain word>          # e.g. document, tool, device, ...
nameKey: ...
descriptionKey: ...
slot: tool                      # optional; presence = equippable (∈ 5-slot enum)
stackable: false                # optional, default false (unique when false)
questProtected: false           # optional, default false
```

(`same WO` migration: the existing `item_document_log` stays author-equivalent —
no `slot`.)

## Error / failure modes

Typed `InventoryError` (`.code` discriminant): `unknown-item`,
`insufficient-stack`, `quest-protected`, `item-equipped`, `non-stackable`,
`negative-dimension`, `invalid-slot`, `not-equipped`. No bare throws on gameplay
paths; every failure is atomic (state + ledger unchanged).

## Save implications

- Adds `domain.inventory` (schema v5) to `SavePayload`, `SaveDomain`,
  `loadPipeline.runtime`, dev harness, and fixtures. Size contract re-verified
  (inventory is small; well under WO-013 caps).
- Version-pinned tests (migrations, schema-v2/v3/v4, save-service, pipeline,
  content-compat) retarget to v5.
- `SaveService`/`loadPipeline` re-validate the v5 guard after migration (already
  the pipeline's behavior).

## Accessibility

- Read-only `InventoryView` for assistive UI; never a HUD that hides needed
  info behind pointer-only interactions (UI AO: WO-030).

## Performance

- Inventory is small (8–16 typical, capped stacks). Reducers are O(stacks) on
  remove; no allocations beyond the next immutable state.

## Security / trust

- No content-driven code execution: item fields are data; the domain never evals
  `stackable`/`questProtected` semantics beyond typed flags.
- Save import of hostile shapes is blocked by the v5 strict guard + size cap.

## Acceptance criteria

- AC-01 addItem: unique grant creates count-1 entry; `added`.
- AC-02 stackable grants increment; replay of the same `(occurrenceId, itemId)`
  is `duplicate` and never re-adds — **ledger survives save/reload**; distinct
  legitimate grants for the same item stay independent. Non-stackable grant with
  `count > 1` → `non-stackable` (rejected, atomic).
- AC-03 removeItem: decrements, reaches 0 removes the entry (`depleted`);
  removing more than owned is `insufficient-stack` and **leaves state unchanged**
  (atomic — never a partial clip); unknown item is `unknown-item`.
- AC-04 questProtected removal is refused (`quest-protected`) and protects
  across reloads (flag → typed fact → domain behavior); forced removal is only
  possible via the explicitly-named `forceRemoveItem`.
- AC-05 equipItem on an owned item with a valid slot sets `equipped[slot]`;
  re-equip same slot is `no-change`; occupied slot `replaced` returns the old
  item to the backpack **and preserves both owned stacks** (quantities untouched).
- AC-06 equip of unknown item / invalid slot is typed; equip requires owned
  positive quantity; equip state never contains unowned items; `unequipItem`
  changes equipment state only.
- AC-07 equip + stacks survive a full save/load round-trip byte-stable
  (schema v5).
- AC-08 v4→v5 migration seeds empty inventory/equipment/ledger, leaves
  dialogue/quest/exploration/progression/skills unchanged, v1→v5 chaining valid;
  v5 guard rejects malformed shapes (non-matching `itemId`, `count <= 0`,
  equipped value not owned, non-slot key, malformed ledger entry).
- AC-09 content-compat rejects (asserts, never silently drops) owned items
  absent from the manifest, equipped items absent from the manifest or not
  owned, and equipped slots incompatible with the authored `slot`.
- AC-10 tightened item schema validates (slot ∈ enum, boolean defaults) and the
  full content set (incl. migrated sample items) passes with zero errors.
- AC-11 application effect executor applies `add_item`/`remove_item`
  `EffectRequest`s deterministically and emits `item.acquired`/`item.removed`
  draft facts **only for successful, non-deduplicated mutations** (no false
  success facts on failed/deduplicated requests); executor lives in the
  application layer (never in dialogue/quest reducers) and routes every request
  through the domain reducers (never bypassing the replay/idempotency contract).
- AC-12 `toInventoryView` returns a stable read-only projection (frozen
  view type; no domain refs exposed).
- AC-13 no equipment effects or item state leak into Dialogue/Quest reducers;
  `SkillCheckInput` remains frozen (no new fields).

## Test plan

| AC | Test type | Test |
| -- | --------- | ---- |
| AC-01..AC-04 | Unit | `tests/unit/inventory/*.test.ts` (add, stack, remove, ledger, protection, forceRemove) |
| AC-05/06 | Unit | `tests/unit/inventory/equip.test.ts` (incl. replace-preserves-stacks, no auto-unequip) |
| AC-07/08 | Unit | `tests/unit/save/schema-v5.test.ts`, `tests/unit/save/migrations.test.ts` |
| AC-09 | Unit | `tests/unit/save/content-compat.test.ts` (equip refs, no silent drops) |
| AC-10 | Unit | `tests/unit/content/*.test.ts` (schema tightening + completeness) |
| AC-11/12/13 | Integration | `tests/integration/inventory-runtime.test.ts` (executor + coordinator-free boundaries) |
| — | Unit (regression) | full save suite (`tests/unit/save/**`, `tests/integration/save-roundtrip.test.ts`) |

Required Red TDD cases (each must exist and be red before implementation):

- duplicate add after reload (ledger persisted) → `duplicate`, count unchanged;
- duplicate remove after reload (ledger persisted) → `duplicate`, count unchanged;
- two distinct removal occurrences for the same item both apply;
- over-removal leaves state unchanged (`insufficient-stack`, atomic);
- final removal of an equipped item follows the frozen rule (`item-equipped`;
  caller must `unequipItem` first); partial removal while equipped is allowed;
- replacing an occupied equipment slot preserves BOTH owned stacks;
- non-stackable `count > 1` grant rejected (`non-stackable` at the domain
  boundary; structural positivity separately at the v5 guard);
- v4→v5 migration preserves dialogue/quest/exploration/progression/skills
  unchanged;
- content compatibility rejects missing item IDs and incompatible persisted
  equipment slots (assert, no silent drop);
- failed/deduplicated mutations emit NO `item.acquired` / `item.removed`
  success facts.

## Implementation notes

- (WO-022 complete — see `execution/work_orders/WO-022_INVENTORY_EQUIPMENT.md`
  close-out for acceptance evidence, verification, and residual risks.)
- Quest protection is resolved from content by the application seam, mirrored
  into the persisted stack at grant time (`AddItemRequest.questProtected` →
  `ItemStack.questProtected`), and enforced by ordinary `removeItem` so it
  survives reloads without reconstructing facts. `forceRemoveItem` is the only
  bypass and records its own `force-remove` ledger entry.
- The `AddItemOutcome` / `RemoveItemOutcome` / `EquipOutcome` /
  `UnequipOutcome` outcome strings, the 8 `InventoryErrorCode` values, and the
  `InventoryView` projection are frozen; consumers must branch on `.code` /
  `.outcome` as documented.
- The removal/unequip mutation is immutable via rebuild (no `delete`, per
  repo eslint) — byte-stable stacks verified in Round-trip tests.

## Open questions

All four WO-022 plan questions were decided by the maintainer on
`WO-022 plan review – APPROVED WITH REQUIRED CONTRACT PATCHES`:

1. **Per-PC vs global inventory** → **GLOBAL** (one canonical
   `InventorySavedState`; no implicit PC ownership).
2. **Remove-with-clip semantics** → **REFUSE** (`insufficient-stack`, atomic).
3. **Removal ledger** → **REQUIRED**: generalized persisted mutation/effect
   ledger (`operation:occurrenceId:itemId`), not acquisition-only.
4. **Executor → quest wiring** → **EXPOSE FACTS ONLY** now; WO-012 quest
   reducer not reopened.

No further plan-review round required unless implementation exposes a concrete
cross-contract incompatibility.

## Revision history

- Rev 0: initial draft for WO-022 Gate.
- Rev 1: applied approved contract patches — generalized ledger, equipped
  removal rule, strict equip invariants, stack invariants, quest-protection
  enforcement contract, content-compat (no silent drops), executor
  no-false-fact rule, schema v5 approval; open questions resolved.