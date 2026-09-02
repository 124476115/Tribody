# 16 — Technical Contracts

These are design-level interfaces. Agent may refine types but must preserve responsibilities.

# Game command

```ts
type GameCommand =
  | { type: 'interaction/use'; targetId: string }
  | { type: 'dialogue/select'; dialogueId: string; choiceId: string }
  | { type: 'inventory/equip'; itemId: string }
  | { type: 'skill/learn'; skillId: string }
  | { type: 'save/request'; slot: SaveSlot }
  | { type: 'scene/exit'; exitId: string };
```

# Domain event

```ts
interface DomainEvent<T extends string = string, P = unknown> {
  id: string;
  type: T;
  payload: P;
  sequence: number;
}
```

Sequence is logical ordering, not wall-clock authority.

### Design-Impact note (WO-002 — Domain Event Kernel)

Implementing contract: `FS-EVENTS-001`, prod at `src/domain/events`.

- `id` is an opaque branded `EventId` (occurrence identity) and is DISTINCT
  from `type` (semantic category). The kernel never generates ids.
- `DraftEvent = Omit<DomainEvent, 'sequence'>`; `sequence` is assigned
  exclusively by the kernel's session processor, ascending from 1.
- New `DomainEventContractError` with `code` discriminant replaces bare error
  handling for events.
- Added `applyReducer(state, event, reducer)` (single-step, no replay) and the
  type-only `GameCommand` boundary above. `SaveSlot` remains a `string` stub;
  WO-013 owns its real definition.

# Game snapshot

UI and renderer consume a read-only projection:

```ts
interface GameSnapshot {
  chapterId: string;
  sceneId: string;
  player: PlayerView;
  questJournal: QuestJournalView;
  dialogue?: DialogueView;
  inventory: InventoryView;
  relationships: RelationshipView[];
  world: WorldView;
}
```

Never expose mutable domain objects directly.

# Content repository

```ts
interface ContentRepository {
  chapter(id: string): ChapterDefinition;
  scene(id: string): SceneDefinition;
  dialogue(id: string): DialogueDefinition;
  quest(id: string): QuestDefinition;
  npc(id: string): NpcDefinition;
}
```

# Persistence port (WO-013 replaces the WO-002 `SaveRepository` stub)

Low-level, framework-independent; implemented by `src/adapters/persistence/IndexedDBPersistence`
and faked as `MemoryPersistence` in tests. Records are **create-only immutable**
(`createRecord` MUST fail on recordId collision; IndexedDB `add` semantics); only slot
pointer docs are mutable.

```ts
interface PersistencePort {
  createRecord(recordId: string, record: SaveRecord): Promise<void>; // collision -> persistence-collision
  getRecord(recordId: string): Promise<SaveRecord | null>;
  deleteRecord(recordId: string): Promise<void>;
  listRecordIds(): Promise<string[]>;
  listSlots(): Promise<SaveSlotDoc[]>;
  getSlot(slotId: SaveSlotId): Promise<SaveSlotDoc | null>;
  putSlot(doc: SaveSlotDoc): Promise<void>;
  deleteSlot(slotId: SaveSlotId): Promise<void>;
}
```

Application-facing semantic surface (WO-014 / WO-030 depend only on this, never on
records/pointers/IndexedDB):

```ts
interface SaveService {
  listSlots(): Promise<SaveSummary[]>;
  saveToSlot(slot: SaveSlotId, domain: DomainRuntime, ctx: SaveContext): Promise<SaveResult>;
  quickSave(domain: DomainRuntime, ctx: SaveContext): Promise<SaveResult>;
  autosave(domain: DomainRuntime, ctx: SaveContext): Promise<SaveResult>;
  loadSlot(slot: SaveSlotId): Promise<LoadOutcome>;
  /** AC-03: newest valid autosave, in deterministic (updatedAt, slotId) order. */
  loadBestAutosave(): Promise<LoadOutcome>;
  deleteSlot(slot: SaveSlotId): Promise<SaveResult<void>>;
  exportSave(slot: SaveSlotId): Promise<SaveResult<string>>;
  importSave(text: string, destSlot: SaveSlotId): Promise<SaveResult>;
}

type SaveSlotId =
  | 'manual-1'
  | 'manual-2'
  | 'manual-3'
  | 'quick'
  | 'auto-1'
  | 'auto-2'
  | 'auto-3'
  | 'auto-4'
  | 'auto-5';
```

`SaveSlotId` is the single source of truth for the slot concept; the WO-002 event
kernel's `GameCommand['slot']` is the _same_ type (alias, no second definition).
`loadBestAutosave` implements the application-level corrupt-autosave fallback:
autosave slots are ordered newest-first by `(updatedAt, slotId)`, corrupt and
`loadIssue`-marked slots are skipped one by one, and the first valid autosave's
runtime is returned. All corrupt → typed `slot-not-found`; no bare throws.

Every save/import is two writes — `createRecord` (immutable) then `putSlot`
(pointer). A failed pointer write returns a typed persistence error, leaves the
destination pointer and the previously referenced record unchanged, and the
just-created record is either rolled back (best effort) or left as an
unreferenced, GC-eligible orphan. No "byte-for-byte untouched" guarantee exists
for this post-create failure path — a new record may have been written.

`SaveRecord` / `SaveSlotDoc` / `SavePayload` / error taxonomy / pipeline: see `FS-SAVE-001`.

The authoritative `SaveDomain` snapshot (WO-014) now carries three runtimes:
`dialogue: DialogueSavedState`, `quest: QuestSavedState`, and
`exploration: ExplorationSavedState` (`{ sceneId, position:{x,y}, visitedScenes[] }`).
Schema version is `2`; legacy v1 saves migrate via the production registry
(`src/domain/save/migrations.ts`) by resuming the persisted `activeSceneId`
with no invented coordinates. Save-time now runs the version guard
(`validatePayload`) in addition to content-compat checks; the v2 guard enforces
`activeSceneId === exploration.sceneId` (contradictory states are rejected, never
silently resolved). The default `SaveService` ships the production `Migrations`
registry so legacy saves load through the v2 pipeline out of the box.

# Audio port

```ts
interface AudioService {
  setBusVolume(bus: AudioBus, value: number): void;
  playCue(cueId: string): Promise<void>;
  stopCue(cueId: string): void;
  transitionMusic(stateId: string): Promise<void>;
  setAmbience(stateId: string): Promise<void>;
}
```

# Canon anchor service

Only this application service may mutate protected macro state.

```ts
interface CanonAnchorService {
  canTrigger(anchorId: string, snapshot: GameSnapshot): boolean;
  trigger(anchorId: string): Promise<CanonAnchorResult>;
}
```

Dialogue/quest content can request:
`anchor.requested`
but cannot write `canon.*` directly.

# Time

Avoid system time in deterministic game logic.
Use injected `GameClock` for playtime/cooldown where required.

# Randomness

If any random outcome is used:

- injected RNG
- seed recorded in save/checkpoint
- tests use fixed seed

Narrative-critical facts must not depend on unrepeatable randomness.
