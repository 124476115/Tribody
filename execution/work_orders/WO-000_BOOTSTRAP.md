# WO-000 — Bootstrap

## Goal
建立最终架构的最小可运行 Browser shell。

## Read first
- START_HERE.md
- AGENTS.md
- docs/06_SDD_ENGINEERING_ARCHITECTURE.md
- docs/07_TDD_AND_TEST_STRATEGY.md

## Tasks
1. Initialize TypeScript + Vite app.
2. Add Phaser render surface.
3. Add React overlay root.
4. Establish strict TS config.
5. Add folder boundaries.
6. Add test runner.
7. Add formatting/linting.
8. Write ADR-001 with exact dependency versions selected.
9. Create one smoke test for domain.
10. Create browser boot smoke E2E.

## Acceptance
- AC-001 `npm run dev` boots a canvas + overlay.
- AC-002 no game rules inside bootstrap.
- AC-003 typecheck/lint/unit/build pass.
- AC-004 one E2E confirms root loads.
- AC-005 dependency versions documented.

## Stop
Do not implement quests/dialogue yet.
