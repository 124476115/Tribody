# WO-001 — Quality Pipeline

Goal: make quality one command.

Implement scripts:
- format
- lint
- typecheck
- test:unit
- test:integration
- validate:content
- build
- quality
- test:e2e

Add CI-equivalent local script.

Acceptance:
- deliberate TS error fails quality.
- deliberate unit failure fails quality.
- clean repo passes.

---

## Implementation Notes

### Pipeline contract (as built)

```text
format:check     prettier --check src/** + tests/** + tools/** (content/ excluded)
lint             eslint . --max-warnings 0
typecheck        tsc --noEmit
test:unit        vitest run tests/unit --passWithNoTests
test:integration vitest run tests/integration --passWithNoTests
validate:content node tools/validate-content/index.mjs
build            tsc --noEmit && vite build
quality          format:check && lint && typecheck && test:unit && test:integration && validate:content && build
ci               quality && test:e2e
test             vitest run (aggregate convenience alias, retained)
verify:pipeline  node tools/verify-quality-failures/verify.mjs
```

- Ordering follows `docs/07_TDD_AND_TEST_STRATEGY.md` (format -> lint -> type ->
  unit -> integration -> content validate -> build); E2E stays at gate level.
- Every upstream step short-circuits downstream steps via `&&`, so a failure in
  any gate fails the whole `quality` command.
- `ci` is a **local** CI-equivalent orchestration only. No external CI/CD
  platform (GitHub Actions / GitLab CI / SonarQube / Codecov / Docker /
  release automation) is introduced by this Work Order.

### validate:content placeholder boundary

`tools/validate-content/index.mjs` is a **pipeline placeholder**, not a content
compiler:

- required content category directories exist (docs/06 layout);
- no authored content files yet -> PASS;
- any authored content file present -> FAIL with "WO-010 pending", so the
  pipeline never silently accepts content it cannot validate.

Explicitly NOT implemented here (belongs to `WO-010 Content Schema`): Chapter /
Dialogue / Quest / NPC / Item / Skill schemas, referential-integrity graph,
narrative DSL, production content compiler, normalization to JSON manifests.

### Negative-verification harness

`tools/verify-quality-failures/verify.mjs` proves the pipeline is genuinely
failable. It stages transient broken artifacts under `__pipeline_probe__`
paths, asserts the relevant command exits non-zero, then removes every artifact
(also on SIGINT/SIGTERM). It exits 0 only if ALL expected failures occurred and
no probe path remains. It is test tooling, not a runtime dependency.

### Decisions

- Probes live in `src/` / `tests/` / `content/scenes/` so prettier, eslint,
  tsc, vitest and the validator all observe them. Probe paths are intentionally
  NOT gitignored: Prettier v3 falls back to `.gitignore` for ignore patterns,
  so ignore rules would hide the artifacts from format checks.
- Integration test: `tests/integration/pipeline-smoke.test.ts` proves the
  integration layer runs under the Vitest node environment with `@domain` alias
  resolution, so `test:integration` is a real step rather than a permanently
  empty `--passWithNoTests` step.
- Format coverage extended from `src/**` to include `tests/**` and
  `tools/**`; `content/` remains excluded (authored content is narrative data,
  formatted via the content pipeline later).

### Verification evidence (acquired at WO-001 close)

```text
npm run verify:pipeline   -> exit 0; ALL 8 EXPECTED FAILURES CONFIRMED
  - format:check fails on a deliberate format problem      (exit 1)
  - typecheck fails on a deliberate TS error               (exit 2)
  - test:unit fails on a deliberate unit failure           (exit 1)
  - validate:content fails on authored content             (exit 1)
  - deliberate TS error fails npm run quality              (exit 2)
  - deliberate unit failure fails npm run quality          (exit 1)
  - content validation failure propagates to npm run quality (exit 1)
  - deliberate format problem fails npm run quality        (exit 1)

npm run quality  -> exit 0 (clean repo: format:check, lint,
                            typecheck, test:unit 3/3, test:integration 1/1,
                            validate:content PASS, build OK)
npm run ci       -> exit 0 (quality + playwright E2E 4/4 chromium)
```

Artifacts from the failure demonstrations were fully cleaned before the clean
state was run; `npm run quality` PASS was the final executed command.