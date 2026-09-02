# 06 — SDD Engineering Architecture

本项目把 SDD 同时解释为：

1. **Specification-Driven Development**：先规范、后测试、再实现。
2. **Software Design Documents**：关键模块必须有可审阅设计文档。

# Architecture goals

- deterministic domain logic
- narrative-as-data
- renderer independence
- testability
- save stability
- incremental content delivery
- agent-friendly file boundaries

# Proposed repository layout

```text
/
  AGENTS.md
  START_HERE.md
  package.json
  vite.config.ts
  tsconfig.json
  src/
    domain/
      dialogue/
      quest/
      progression/
      inventory/
      relationship/
      challenge/
      save/
      events/
    application/
      commands/
      usecases/
      chapter/
    adapters/
      content/
      persistence/
      audio/
      input/
    game/
      scenes/
      entities/
      camera/
      interactables/
    ui/
      app/
      hud/
      dialogue/
      journal/
      inventory/
      skills/
      codex/
      timeline/
      settings/
    bootstrap/
  content/
    chapters/
    scenes/
    dialogue/
    quests/
    npcs/
    items/
    skills/
    medals/
    codex/
    audio/
    localization/
  schemas/
  tests/
    unit/
    integration/
    e2e/
    fixtures/
  tools/
    validate-content/
    build-content/
  docs/
  specs/
  adr/
```

# Runtime boundaries

## Domain

Zero framework dependency.

Example:

```ts
resolveSkillCheck(input): SkillCheckResult
advanceQuest(state, event): QuestState
applyDialogueEffects(state, effects): GameStatePatch
```

## Application

Coordinates:

- load scene
- start dialogue
- dispatch domain event
- checkpoint save
- switch chapter

## Adapter

Impure I/O:

- IndexedDB
- file import/export
- Howler
- content fetch
- browser APIs

## Phaser

Never owns canonical game state.
It renders a projection and emits player intents.

## React

Never mutates domain state directly.
UI sends command; application returns state/event.

# Event bus

Typed domain events.

Properties:

- serializable
- timestamp optional metadata
- unique event id where needed
- quest engine consumes events
- analytics adapter may consume only non-sensitive gameplay metrics if enabled

Do not use event bus as a replacement for clear function calls. Use it for cross-domain gameplay events.

# Save architecture

`SaveRecord` (immutable, WO-013 / FS-SAVE-001)

- schemaVersion
- contentVersion
- gameVersion
- createdAt
- checksum
- payload

The checksum is SHA-256 over the canonical finalized body
`{ schemaVersion, contentVersion, gameVersion, createdAt, payload }`; it detects record
corruption (not tampering). `schemaVersion` / `contentVersion` are inside the checksum.
Mutable per-slot state (`updatedAt`, load issues, summary meta) lives in `SaveSlotDoc`.
Records are create-only (IndexedDB `add`); slot pointers are swapped atomically.

Payload:

- chapter/scene
- checkpoint
- domain states (Dialogue + Quest runtime)
- playtime

Migration:
`v1 -> v2 -> v3`, never `v1 -> latest` custom branches. Production registry contains only
real persisted formats (empty at v1); sequential behavior is tested via an injected
registry.

On load:

1. parse
2. header shape (forward-compatible; no payload whitelist here)
3. verify checksum (finalized body)
4. version-specific payload validation
5. sequential migrations
6. validate latest schema
7. hydrate domain (continuation-critical refs vs ContentCatalog)
8. if migrated: persist the migrated record and repoint the slot (the original immutable
   record already serves as the backup); persistence failure here is a warning, never a
   blocked load

# Content build

Source: YAML for authoring.
Build:

1. parse
2. schema validate
3. referential integrity
4. graph checks
5. localization key check
6. dialogue reachability
7. quest objective validation
8. output normalized JSON manifest

Dev server may hot reload content.

# Content graph checks

Mandatory:

- dangling dialogue next node
- unreachable mandatory node
- missing NPC
- missing scene
- duplicate ID
- quest with no resolvable completion
- item reference missing
- required localization missing
- chapter has no entry scene
- canon anchor order violation

# Error handling

Player-facing:

- content load retry
- save recovery
- audio failures degrade silently + log
- missing optional art uses placeholder
- missing mandatory scene blocks build, not runtime

# Observability

Dev only:

- narrative event console
- quest state inspector
- dialogue graph viewer
- save inspector
- current flags panel

Production:

- no debug panel
- sanitized error reporting if project later adds telemetry

# Security

- no eval
- no user-supplied executable scripts
- validate imported saves: size cap, depth cap, dangerous-key/unknown-key rejection,
  checksum, version, content compatibility — all before any storage write
- limit imported save file size (shared `MAX_SERIALIZED_SAVE_BYTES` contract)
- escape text rendered in DOM
- CSP-friendly asset loading
- no secrets in client bundle
- save checksum is corruption detection, not authenticity; cross-tab last-writer-wins
  lost pointer updates are accepted debt (single-active-tab assumption)
