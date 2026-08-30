# 16 — Technical Contracts

These are design-level interfaces. Agent may refine types but must preserve responsibilities.

# Game command

```ts
type GameCommand =
  | { type: "interaction/use"; targetId: string }
  | { type: "dialogue/select"; dialogueId: string; choiceId: string }
  | { type: "inventory/equip"; itemId: string }
  | { type: "skill/learn"; skillId: string }
  | { type: "save/request"; slot: SaveSlot }
  | { type: "scene/exit"; exitId: string };
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

# Persistence port

```ts
interface SaveRepository {
  list(): Promise<SaveSummary[]>;
  read(slot: SaveSlot): Promise<SaveEnvelope | null>;
  write(slot: SaveSlot, save: SaveEnvelope): Promise<void>;
  remove(slot: SaveSlot): Promise<void>;
}
```

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
