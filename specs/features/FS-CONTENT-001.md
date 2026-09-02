# FS-CONTENT-001 — Content Authoring Schema & Validation Pipeline

## Status

Draft — approved for implementation by WO-010 plan review (2026-08-30), with
three binding corrections incorporated below.

## Problem

Every runtime system (dialogue, quest, save, exploration) needs content, but
YAML must never be parsed at runtime (AGENTS layering). Without a single
canonical validation gate, each WO would invent its own loading path, producing
non-versioned, unvalidated, non-deterministic content and mid-game breakage such
as dangling dialogue links, missing NPCs, or canon namespace mutation.

## Player value

Broken content becomes a build-time failure, not a mid-game bug. The player
gets consistent, complete, localizable content; long-running trust in saves is
preserved because game identity always comes from stable content IDs, never from
file paths.

## Scope

### In

- Authoring DSL + validation pipeline for the 9 WO-010 content types:
  chapter, scene, npc, dialogue, quest, item, skill, codex, audio cue.
- Referential-integrity validator (hard vs soft references).
- Dialogue structural graph validation (dangling `next`, cycles, reachability).
- Quest structural-only validation (no behavior/reachability analysis).
- Declarative condition/effect whitelist (Zod discriminated unions), no eval.
- Canon namespace protection (`canon.*`, `era.transition.*`).
- Localization-key boundary: production content uses keys; primary locale
  (zh-CN) must contain every referenced key.
- Deterministic normalization to a versioned `manifest.json`
  (`schemaVersion`, `contentVersion`, `sourceHash`; ordered arrays preserved).
- CLI that keeps the `npm run validate:content` seam (exit 0 / 1).
- Red-first implementation (Spec → failing tests → minimal code → Green).

### Out

- Dialogue runtime, quest runtime (WO-011/012), save integration (WO-013),
  exploration loading (WO-014).
- Content for medals / playable characters (`pc_*`) / evidence (`ev_*`) /
  map packs (`pack_*`) — grammar-only soft references, existence deferred.
- Any machine-generated/campaign prose, CMS, editor.
- Runtime parsing of YAML anywhere in the game.
- Any Event Sourcing or DomainEvent construction during validation.
- Monster schemas: schema count must stay proportional (one file per concern,
  not dozens per concept).

## Binding corrections (from WO-010 plan review)

1. **Architecture boundaries.** `src/domain/content` contains _only_ pure
   normalized content contracts/types and domain-safe ID concepts. YAML
   parsing, filesystem discovery, Zod authoring validation infrastructure,
   SHA-256/source hashing, `manifest.json` writing, and CLI concerns live in
   `schemas/` (Zod data contracts) and `tools/validate-content/` (build
   time). `src/domain` never depends on Node fs/crypto/YAML/Zod.
2. **Do not sort semantically ordered arrays.** Dialogue choices, quest
   objectives, scene exits/interactions, and any future authored sequence keep
   their declared order through normalization. Only collections whose order is
   defined as semantically irrelevant are sorted (manifest top-level lookup
   maps; localization key maps). Determinism = same semantic source ⇒ same
   normalized output, not arbitrary reordering of authored gameplay content.
3. **Content ID comes from content, not filename.** The `id` field inside the
   YAML entity is the authoritative identity. A file may be named anything;
   filename/path are diagnostic/source metadata only. Renaming/moving a source
   file never changes game identity or save references. Duplicate IDs still
   fail globally and per type. (`<id>.yaml` remains a _recommended_ authorship
   convention, not an enforced rule.)

## User flow

1. Author YAML content under `content/<category>/` with referenced localization
   keys under `content/localization/zh-CN/`.
2. `npm run validate:content` (part of `npm run quality`) validates and, on
   success, emits `content/generated/manifest.json`.
3. Runtime systems (later WOs) load the normalized `manifest.json` only.

## Domain model

See `src/domain/content/`:

- Stable content IDs, per-type, with the full AGENTS.md syntax where defined
  (`ch_<era>_<nn>_<slug>`, `sc_<chapter>_<nn>_<slug>`, `npc_<slug>`,
  `dlg_<slug>`, `q_<chapter>_<slug>`, `item_<category>_<slug>`,
  `skill_<tree>_<slug>`, `codex_<category>_<slug>`, and the new permanent
  prefix `cue_<category>_<slug>` for audio cues).
- Hard references (target type exists in same build) vs soft references
  (grammar-only; existence owned by a later WO).
- Declarative JSON-safe conditions and whitelisted effects.
- Canon namespace predicate; story-flag / semantic-event-name / localization-
  key grammars as pure functions.

## State machine

The build pipeline (not a domain state machine):

```
discover (sorted) → parse (yaml, uniqueKeys) → per-type zod schema
→ ID grammar/duplicates → ref-integrity → dialogue graph → quest boundary
→ conditions/effects + canon → localization → normalize
→ contentHash → manifest.json    (any error ⇒ no manifest written)
```

## Data contract

Authoring Schema lives in `schemas/content/` (Zod). Normalized manifest
contract lives in `src/domain/content`. All player-visible strings are keys
matching `[a-z0-9]+(\.[a-z0-9_]+){2,}` (e.g. `chapter.ch04.title`,
`dlg.ch04.observatory.chenmo.choice.ask_device`).

Representative (see schema modules for the exhaustive shape):

```yaml
# dialogue/ch04.yaml
id: dlg_ch04_camera_anomaly
entryNode: n01
nodes:
  n01:
    speaker: npc_lab_colleague
    textKey: dlg.ch04.camera.n01.text
    choices:
      - id: c_ask
        textKey: dlg.ch04.camera.n01.c_ask.text
        next: n02
        effects:
          - kind: quest_event
            event: ch04.raw_data_compare_requested
      - id: c_hide
        textKey: dlg.ch04.camera.n01.c_hide.text
        next: end
        effects:
          - kind: adjust_relationship
            npcId: npc_lab_colleague
            dimension: trust
            amount: -2
```

```yaml
# quests/q_ch04_explain.yaml
id: q_ch04_explain_countdown
chapterId: ch_common_04_countdown
titleKey: quest.ch04.explain.title
initialState: available
objectives:
  - id: obj_compare
    type: analyze
    required: true
    listensFor:
      - ch04.raw_data_compare_requested
  - id: obj_talk
    type: talk
    required: true
    npcId: npc_lab_colleague
resolution:
  onAllRequiredComplete: resolved_success
journal:
  startKey: quest.ch04.explain.start
  completeKey: quest.ch04.explain.complete
```

Quest `initialState` is restricted to `locked | available | active`. Resolved
statuses (`resolved_success | resolved_costly | resolved_failure | archived`)
are runtime statuses owned by the quest engine (FS-QUEST-001); they are never
authored in content and are persisted only in save data (see WO-012 lifecycle
correction).

### Error model

```ts
interface ContentIssue {
  severity: 'error' | 'warning';
  category: IssueCategory;
  file: string; // e.g. "content/dialogue/ch04.yaml"
  contentId?: string; // absent only if the file could not be parsed as content
  path?: string; // e.g. "nodes.n02.choices[0].next"
  message: string; // e.g. 'missing node "n99"'
}
```

Rendered exactly as: `{file} → {contentId} → {path} → {message}`.

### Referential integrity matrix

Hard refs (must resolve within the same build):

| Source     | Field                                                                              | Target                                         |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| chapter    | entrySceneId                                                                       | scene (and `scene.chapterId === chapter.id`)   |
| scene      | chapterId                                                                          | chapter                                        |
| scene      | npcs[].npcId                                                                       | npc                                            |
| scene      | linkedDialogueIds                                                                  | dialogue                                       |
| scene      | exits[].toSceneId                                                                  | scene                                          |
| scene      | ambienceCueId / musicCueId                                                         | audio cue                                      |
| scene      | onEnter / choice effects                                                           | per-condition/effect matrix below              |
| npc        | defaultDialogueId                                                                  | dialogue                                       |
| dialogue   | entryNode                                                                          | node in the same dialogue                      |
| dialogue   | nodes[].speaker                                                                    | npc (or reserved literals `player`/`narrator`) |
| dialogue   | nodes[].choices[].next                                                             | node in the same dialogue, or literal `end`    |
| dialogue   | nodes[].voiceCueId                                                                 | audio cue                                      |
| quest      | chapterId                                                                          | chapter                                        |
| quest      | objectives[].npcId/sceneId/dialogueId                                              | owned types                                    |
| quest      | objectives[].itemIds/skillIds/codexIds                                             | owned types                                    |
| codex      | relatedIds                                                                         | codex                                          |
| conditions | skillId / itemId / codexId / npcId / questId / chapterId                           | owned types                                    |
| effects    | add_item.itemId / add_codex.codexId / play_audio.cueId / adjust_relationship.npcId | owned types                                    |

Soft refs (grammar-only):

| Source  | Field                    | Grammar                            |
| ------- | ------------------------ | ---------------------------------- |
| chapter | playableCharacterId      | `pc_*`                             |
| chapter | assetPack                | `pack_*`                           |
| chapter | prerequisites[]          | `flag.<chapter>.<subject>.<state>` |
| chapter | canonAnchors[]           | `anchor.*`                         |
| chapter | actId                    | `act_*`                            |
| quest   | objectives[].evidenceIds | `ev_*`                             |
| quest   | objectives[].listensFor  | semantic event name `a.b`          |

### Dialogue graph rules

- `entryNode` exists and is not `end`.
- Every `next` resolves to an existing node or the literal `end`.
- `end` is a reserved terminal literal; never a valid node id.
- No node id may be `end`; node ids unique within a dialogue.
- No cycle through autoNext-only chains reachable from entry.
- Every node reachable from entry; unreachable node = error.

### Conditions / effects contract

Zod discriminated unions. Unknown `kind` fails. No eval/no arbitrary JS.

Conditions: `flag`, `quest_state`, `relationship_at_least`, `skill_at_least`,
`has_item`, `has_codex`, `chapter_state`.

Effects: `set_flag`, `adjust_relationship`, `add_item`, `remove_item`,
`add_codex`, `quest_event`, `award_xp`, `play_audio`, `emit_narrative_event`.

`set_flag` targeting `canon.*` or `era.transition.*` is a canon-protected
error.

### Quest structural boundary

- Objective `type` in the known set (`collect_evidence`, `analyze`, `talk`,
  `go_to`, `interact`, `choose`, `survive`, `repair`, `escort`,
  `wait_for_event`).
- Per-type required fields present (e.g. `collect_evidence`→evidenceIds,
  `talk`→npcId, `analyze`→listensFor).
- Objective ids unique within quest; `initialState` in an enum;
  `resolution.onAllRequiredComplete` in an enum; `listensFor`/`quest_event`
  names pass semantic-event grammar.
- No reachability/completion analysis (WO-012).

### Localization

- Production text is keys; inline prose is hard-rejected in production content.
- Every referenced key must resolve in primary locale zh-CN; missing key fails
  the build (FS-DIALOGUE-001 AC-08).
- Locale files validated as key→string maps; extra unused keys allowed.

### Manifest

Emits `content/generated/manifest.json`:

```ts
interface ContentManifest = {
  meta: {
    schemaVersion: '1.0.0';
    contentVersion: '0.1.0';
    sourceHash: string;   // sha256 over canonical content payload
    generatedAt?: string; // metadata only; excluded from hash and equality
  };
  chapters/scenes/npcs/dialogues/quests/items/skills/codex/audioCues:
    Record<Id, Manifest>;   // lookup maps: sorted by id in emission
  localization: Record<Locale, Record<Key, string>>;
}
```

Determinism: fixed key order + sorted lookup maps + **preserved authored order
for gameplay arrays** (choices, objectives, exits, interactions, spawnPoints,
npcs list, conditions, effects, prerequisites, canonAnchors, tags, relatedIds).

### Canon namespace

`set_flag` on `canon.*` / `era.transition.*` from ordinary content is rejected.
Normal dialogue cannot, e.g., `set_flag: canon.solar_constants.flipped`.

## Inputs / outputs

- Input: `content/**` YAML (+ `content/localization/<locale>/*.yaml`).
- Output: either `ContentIssue[]` (fail, exit 1) or `ContentManifest`
  written to `content/generated/manifest.json` (success, exit 0).

## Error / failure modes

| Condition                                                 | Result                      |
| --------------------------------------------------------- | --------------------------- |
| Unsupported extension / unparseable YAML / duplicate keys | parse issue, fail           |
| Schema violation / unknown condition or effect kind       | schema issue, fail          |
| Malformed content ID / duplicate ID                       | id/duplicate-id issue, fail |
| Missing hard reference                                    | missing-ref issue, fail     |
| Canon-protected set_flag                                  | canon issue, fail           |
| Dialogue `next`/autoNext/entry/graph violations           | graph issue, fail           |
| Quest structural violation                                | contract issue, fail        |
| Missing primary-locale key / malformed key / inline prose | localization issue, fail    |
| Determinism violation (mismatched canonical form)         | manifest issue (test)       |

## Save implications

- Save references stable content IDs only. The manifest `contentVersion` +
  `sourceHash` are the future compat markers WO-013 reads for FS-SAVE-001
  AC-05 (old content IDs handled by explicit migration map). No save schema
  change in this WO.

## Accessibility

Not applicable (build-time pipeline). Content authors must never rely on
sound-only design (docs/04 §7).

## Performance

Pipeline is single-pass, O(n) over documents (plus bounded graph DFS).
`manifest.json` is small (text + references; no assets). No runtime cost zon:
later runtime loads normalized JSON, never YAML.

## Security / trust

- YAML parsed with duplicate-key rejection; no custom tags; no eval.
- Only whitelisted declarative effects; nothing executes at build time.
- Canon namespace is read-only outside the (future) CanonAnchorService.
- No Network/IndexedDB/browser APIs in `src/domain/content`.

## Acceptance criteria

- AC-01 — A broken dialogue `next` node fails validation with an actionable
  `file → id → path → message` error.
- AC-02 — A missing NPC reference (scene npc, dialogue speaker, quest talk)
  fails validation.
- AC-03 — Duplicate content IDs fail (per type and across files).
- AC-04 — A chapter entry scene that is missing or belongs to a different
  chapter fails validation.
- AC-05 — An unknown condition/effect kind fails validation.
- AC-06 — A `set_flag` targeting the canon namespace is rejected.
- AC-07 — An invalid quest objective (unknown type or missed per-type field or
  dangling ref) fails validation.
- AC-08 — A localization key missing from the primary locale (zh-CN) fails the
  build; inline prose in production content fails.
- AC-09 — Cyclic autoNext-only dialogue chains are rejected.
- AC-10 — A valid fixture builds a normalized manifest carrying
  `schemaVersion`, `contentVersion`, and `sourceHash`.
- AC-11 — Manifest emission is deterministic: identical semantic input yields
  byte-identical output, and **authored ordering of dialogue choices, quest
  objectives, and exits is preserved**.
- AC-12 — Malformed content IDs and malformed YAML (duplicate keys, non-map
  root) are rejected.
- AC-13 — The CLI seam is preserved: exit 0 on valid/empty content, exit 1 +
  aggregated issues on invalid content, no manifest written on failure.
- AC-14 — Validation constructs no DomainEvents; `src/domain/content` has no
  Phaser/React/browser/Node/zod imports.

## Test plan

| AC    | Test type   | Test                                                                   |
| ----- | ----------- | ---------------------------------------------------------------------- |
| AC-01 | Unit        | `tests/unit/content/dialogue-graph.test.ts`                            |
| AC-02 | Unit        | `tests/unit/content/refintegrity.test.ts`                              |
| AC-03 | Unit        | `tests/unit/content/ids.test.ts`                                       |
| AC-04 | Unit        | `tests/unit/content/refintegrity.test.ts`                              |
| AC-05 | Unit        | `tests/unit/content/conditions-effects.test.ts`                        |
| AC-06 | Unit        | `tests/unit/content/conditions-effects.test.ts`                        |
| AC-07 | Unit        | `tests/unit/content/quest.test.ts`                                     |
| AC-08 | Unit        | `tests/unit/content/localization.test.ts`                              |
| AC-09 | Unit        | `tests/unit/content/dialogue-graph.test.ts`                            |
| AC-10 | Unit        | `tests/unit/content/manifest.test.ts`                                  |
| AC-11 | Unit        | `tests/unit/content/manifest.test.ts` (incl. order preservation)       |
| AC-12 | Unit        | `tests/unit/content/ids.test.ts`, `tools/validate-content` parse tests |
| AC-13 | Integration | `tests/integration/content-pipeline.test.ts`                           |
| AC-14 | Unit        | `tests/unit/content/domain-purity.test.ts`                             |

## Verifiability

- `npm run quality` (includes validate:content).
- `npm run ci` (quality + E2E).
- `npm run verify:pipeline` (placeholder probe still fails for genuine reasons).

## Implementation notes

Closed via WO-010 (2026-08-30). All acceptance criteria pass.

- **Layering fidelity**: `src/domain/content` is pure contracts/types only
  (`types.ts`, `ids.ts`, `guards.ts`, `index.ts`) — validated by
  `domain-purity.test.ts` (no Phaser/React/Zod/fs/react-dom builtins, no
  DomainEvent construction). YAML parse, filesystem discovery, Zod schemas,
  SHA-256 hashing, and `manifest.json` writing live in `schemas/content/` and
  `tools/validate-content/`.
- **Schema home**: authoritative authoring schemas in
  `schemas/content/entities.ts` + `schemas/content/conditions.ts`
  (discriminated unions), single registry
  `schemas/content/index.ts`. `strict()` objects; `z.record(z.string(), …)`
  per zod 4 signature.
- **Pipeline**: `tools/validate-content/pipeline.ts` (parse → schema →
  ref-integrity → canon guard → dialogue graph → quest structure →
  localization → manifest) and CLI entry `tools/validate-content/index.ts`
  (`npm run validate:content`). Non-YAML files are only errors when they are
  not dot-prefixed (`.gitkeep` skipped; verified by `verify:pipeline` probe).
- **Determinism**: lookup maps key-sorted; semantically ordered authoring
  arrays (choices, objectives, exits, spawn points, ids, conditions,
  effects, prerequisites, anchors, tags, relatedIds) byte-preserved.
  `sourceHash` = SHA-256 over the merged source set; `schemaVersion: '1.0.0'`.
- **Tooling**: `tsx` runs the CLI; configs wired (`tsconfig` includes for
  `schemas/**/*`, `tools/**/*`; prettier globs; `.gitignore`
  `content/generated/`).
- **Types**: domain optional fields declared `?: T | undefined` to satisfy
  `exactOptionalPropertyTypes` against zod `.optional()` outputs.
- **Tests**: 59 green content tests (9 unit files in `tests/unit/content/`,
  10 integration incl. `content-pipeline.test.ts`); e2e 4/4; `npm run quality`
  and `npm run ci` pass; `verify:pipeline` reports all 8 expected failures
  including the new WO-010 `validate:content` case.

## Open questions

- Evidence-content ownership that turns soft `ev_*` refs into hard refs
  (deferred to the owning WO).
- `contentVersion` bump policy when WO-040 authors real content (deferred).

## Revision history

- v1: Created as part of WO-010 plan approval; incorporates the three binding
  corrections (architecture boundaries, ordered arrays, ID authority).
