# WO-021 — Skills & Checks

Implement five skill trees and deterministic three-tier checks.

Must support:
- attribute
- skill
- evidence
- relationship
- situational modifier

No mandatory story fact permanently lost by random roll.

## Scope

- Pure skills domain (`src/domain/skills/`): canonical 20-skill catalog (5
  trees × 4), learn-only acquisition, deterministic RollV1 dice.
- Application checks coordinator (`src/application/checks/coordinator.ts`):
  reads current canonical state and maps the three-tier result onto the
  dialogue's fixed binary edge.
- Save schema v4: `domain.skills` with per-PC `values` (strict 0|1) and a
  persisted `learnLedger`; v3→v4 migration seeds an empty `pcs` map.
- Content: 20 `content/skills/*.yaml` documents + `zh-CN` localization;
  `SkillManifest.tree` tightened to the canonical 5-tree enum.
- Out of scope (WO-021): rank/budget progression, evidence/relationship bonus
  state, per-chapter difficulty overrides (injection hooks only), UI/HUD.

## Implementation Notes

- Contract is locked in `specs/features/FS-SKILL-001.md` (AC-01..AC-13). The
  RollV1 algorithm and golden vectors there are frozen; do not change without a
  new schema decision.
- Check roll identity: `<dialogueId>#<instanceOrdinal>#<nodeId>#<choiceId>#<skillId>`;
  identical identity re-rolls the same value across reloads with zero retained
  RNG state.
- Difficulty: default `{ die: 20, clearMargin: 3 }` in the domain; per-chapter
  config injects later (WO-024/WO-030). Bands are locked.
- Learn semantics: dedup per `(occurrenceId, skillId)` ledger; a first learn
  creates the PC record unconditionally; learning different skills from the
  same occurrence is legal.
- Progression owns attributes (intellect/perception/will); skills only read the
  primary attribute at resolution time (current-state-at-resolution). Six GDD
  attributes map onto the three frozen progression attributes.
- Schema v4 migration is pure and content-independent: `pcs` seeds `{}`;
  existing v1–v3 rules and validators are byte-identical.
- Content pipeline: `validate:content` regenerates `content/generated/manifest.json`
  and enforces catalog completeness via the domain `isCanonicalSkill`.
- Verification: full `npm run quality` (format, lint, typecheck, unit ×372,
  integration, content validation, build) + e2e 6/6 green.

## Verification evidence

- Unit: `tests/unit/skills/{roll,catalog,learn,check}.test.ts` (27 tests),
  `tests/unit/save/schema-v4.test.ts`, content catalog-completeness test.
- Integration: `tests/integration/skills-runtime.test.ts` (coordinator +
  dialogue edge + current-state rescue).
- `npm run quality`: PASS. E2E: 6/6 PASS.

## Close-out (2026-09-02)

### Completed
- Pure skills domain (`src/domain/skills/`): canonical 20-skill catalog, learn-only
  acquisition with persisted per-PC ledger, frozen RollV1, three-tier checks.
- Application checks coordinator mapping tiers onto the dialogue binary edge.
- Save schema v4 (`migrateV3ToV4` seeds `{ pcs: {} }`, `validatePayloadV4` uses the
  domain `isCanonicalSkill`), full re-validation at target; v1/v2/v3 loaders retarget.
- Content: 20 `content/skills/*.yaml` + `zh-CN` localization; `SkillManifest.tree`
  tightened to the canonical 5-tree enum; manifest regenerated.
- Version-pinned save tests updated (migrations, schema-v2/v3, save-service, pipeline,
  content-compat) and new `tests/unit/save/schema-v4.test.ts`.

### Acceptance criteria
- AC-01..AC-13 of FS-SKILL-001: PASS — tracked in the spec's Test plan +
  `tests/unit/skills/*`, `tests/unit/save/schema-v4.test.ts`,
  `tests/integration/skills-runtime.test.ts`, `tests/unit/content/manifest.test.ts`.

### Verification
- `npm run quality`: PASS (format, lint, typecheck, 372 unit+integration tests,
  `validate:content` → 20 docs/1 locale, build).
- E2E: 6/6 PASS (boot + reload suites).

### Files changed
- `src/domain/skills/*`, `src/domain/index.ts`, `src/domain/save/{types,migrations,guards}.ts`
- `src/application/checks/coordinator.ts`, `src/application/save/{save-service,loadPipeline}.ts`
- `src/dev/harness.ts`, `schemas/content/entities.ts`
- `tests/unit/skills/*` (4), `tests/unit/save/{schema-v4,migrations,schema-v3,content-compat}.test.ts`,
  `tests/integration/skills-runtime.test.ts`, `tests/helpers/{save-fixtures,valid-content-set,dialogue-fixtures}.ts`
- `content/skills/*` (20), `content/localization/zh-CN/skills.yaml`, `content/generated/manifest.json`
- `specs/features/FS-SKILL-001.md`, `execution/work_orders/WO-021_SKILLS_CHECKS.md`,
  `execution/TRACEABILITY_MATRIX.md`

### Why / What / Migration / Player impact / Risks
- **Why**: canonical, deterministic skills foundation for all check-gated content.
- **What**: frozen RollV1 + three tiers + learn-only ledger + coordinator; no UI yet.
- **Migration**: v1→v4 auto-migrates (v2/v3 add exploration/progression, v3→v4 adds
  an empty `skills.pcs`). Existing saves load unchanged; pending skill checks keep
  their identity and re-roll deterministically.
- **Player impact**: none visible yet (content/UI land in WO-040); existing saves
  remain compatible.
- **Risks**: rank/budget and per-chapter difficulty intentionally deferred (injection
  hooks only); GDD 6-attribute list maps onto the frozen 3; no new third-party deps
  added (FNV-1a32 implemented by hand).

### Next allowed Work Order
- WO-022 (Inventory/Equipment) or a UI/handoff step per gate.