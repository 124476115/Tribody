# 07 — TDD & Test Strategy

# Principle

“测试”不是最后 QA。
核心规则必须先通过可执行测试定义。

Cycle:
`Spec → failing test → minimal implementation → pass → refactor → integration → E2E`

# Test pyramid

## Unit — largest
Targets:
- skill checks
- XP/levels
- inventory
- relationship changes
- quest transition
- dialogue conditions/effects
- content condition evaluator
- save migration
- codex unlock
- medal criteria

Characteristics:
- no browser
- no Phaser
- deterministic
- fast

## Integration
Targets:
- content loader + schema
- dialogue + quest event
- scene command + checkpoint save
- chapter transition
- audio cue adapter contract
- imported save validation

## E2E
Critical paths only:
- boot
- new game
- move
- interact
- dialogue choice
- quest completion
- skill upgrade
- equip tool
- save
- reload
- continue
- settings persistence
- chapter transition

# Mandatory test categories

### Narrative invariants
- Hard Canon flags cannot be unset by normal choice effects.
- Choice may affect Tier C state but not illegal Tier A outcome.
- Mandatory scene remains reachable.

### Save
- round trip
- old fixture migration
- corrupted checksum
- unknown extra fields
- missing required field
- interrupted save simulation
- autosave rotation

### Dialogue
- condition true/false
- no infinite auto-next loop
- no dangling node
- choice side effects exactly once
- skill check result routing
- localization key present

### Quest
- duplicate domain event idempotency
- out-of-order optional event
- resume from save
- no soft lock at required objective

### Browser
- resize
- tab hide/show
- audio context resume after user gesture
- keyboard focus
- pointer input
- reduced motion

# Visual regression

Use Playwright screenshots only for stable UI surfaces:
- dialogue
- journal
- inventory
- skill tree
- save screen

Do not screenshot-test whole animated gameplay every commit.

# Test naming

`Given_When_Then`

Example:
`givenEvidenceAndHighReason_whenAnalyzingSignal_thenReturnsClearSuccess`

# Acceptance criteria traceability

Feature Spec:
- AC-01...
- AC-02...

Tests include IDs:
```ts
describe("FS-DIALOGUE-001", () => {
  it("AC-03 ...", ...)
})
```

# Property-like tests

Useful areas:
- save migration preserves invariant IDs
- XP never decreases from award action
- inventory count never below zero
- dialogue runtime never executes unknown effect
- quest resolved state never returns to active without explicit reset API

# Content validation tests

Content is code-like and must fail CI on:
- duplicate IDs
- broken refs
- empty required dialogue
- illegal canon mutation
- unknown condition/effect
- missing localized key

# Quality command

Agent should implement:
```bash
npm run quality
```

Equivalent pipeline:
1. format check
2. lint
3. typecheck
4. unit
5. integration
6. content validate
7. build

E2E may be separate in early local loop but required at Work Order gates:
`npm run test:e2e`

# Bug workflow

Every confirmed bug:
1. add failing regression test
2. fix
3. retain test permanently unless architecture removed
