# ADR-001: Dependency Versions

## Status

Proposed

## Context

WO-000 requires establishing the minimum viable architecture shell for Project Trisolaris Chronicle. We need to select stable, compatible dependency versions that will support a browser-based narrative RPG built with TypeScript, Vite, Phaser 3, and React.

## Decision

### Runtime Environment

**Node.js**: >= 20.0.0 (minimum supported)

- **Rationale**: The `engines` floor was set to Node 20+ (npm 10+). Node 20 has since reached end-of-life (April 2026); the development environment runs the active LTS Node.js v24.15.0 with npm 11.12.1, which is compatible and supported.
  - _Correction note: the original claim "Node 20 is current LTS with support until April 2026" is now stale — see Amendment 001._

**npm**: >= 10.0.0

- **Rationale**: npm 10+ comes bundled with Node.js 20+ and has improved performance and security features. Current environment has npm 11.12.1.

### Core Dependencies

**TypeScript**: 5.9.3

- **Rationale**: Latest stable TypeScript 5.x release. Provides excellent type inference, strict mode enforcement, and full compatibility with Vite 6 and React 18. TypeScript 7.x is in early development (dev releases) and not suitable for production.

**Vite**: 6.4.3

- **Rationale**: Latest stable Vite 6.x release. Vite 6 provides fast HMR, optimized production builds, and excellent TypeScript support. Vite 8.x exists but is newer; Vite 6.x is mature and widely adopted with extensive plugin ecosystem.

**Phaser**: 3.90.0

- **Rationale**: Latest stable Phaser 3.x release. The project documentation explicitly specifies Phaser 3 as the foundation.

  **Why Phaser 3.x instead of Phaser 4.x?**
  - Phaser 3.x is mature, stable, and has extensive documentation and community support
  - Phaser 4.x (latest: 4.2.1) is a significant architectural shift still in active development
  - Phaser 3.x has proven compatibility with the React + Vite stack
  - The project design documents (START_HERE.md, docs/06_SDD_ENGINEERING_ARCHITECTURE.md) explicitly specify "Phaser 3"
  - Migration to Phaser 4 in the future would require an ADR with clear benefits outweighing risks
  - For a Vertical Slice focused on stability, Phaser 3.x minimizes risk

**React**: 18.3.1

- **Rationale**: Latest stable React 18.x release. React 19 exists (19.2.8) but is relatively new. React 18.3.1 provides:
  - Stable Concurrent Features
  - Automatic Batching
  - Mature ecosystem and tooling support
  - Proven compatibility with Vite 6 and TypeScript 5.9
  - Extensive testing with Phaser integration patterns

**React-DOM**: 18.3.1

- **Rationale**: Must match React version for consistency.

### Development Dependencies

**Vitest**: 4.1.11

- **Rationale**: Latest stable Vitest release. Provides fast unit testing with native Vite integration, excellent TypeScript support, and compatible with Node.js 20+.

**@playwright/test**: 1.62.1

- **Rationale**: Latest stable Playwright release. Provides reliable E2E testing across browsers, excellent debugging tools, and native TypeScript support.

**ESLint**: 9.39.5

- **Rationale**: Latest stable ESLint 9.x release. ESLint 10.x exists but eslint-plugin-react@7.37.5 only supports ESLint ^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7. Using ESLint 9.x ensures compatibility with the React linting ecosystem.

**Prettier**: 3.9.6

- **Rationale**: Latest stable Prettier release. Ensures consistent code formatting across the codebase.

**@vitejs/plugin-react**: 5.0.4

- **Rationale**: Latest stable Vite React plugin. Required for React Fast Refresh and JSX transformation in Vite.

**@types/node**: 24.7.2

- **Rationale**: TypeScript definitions for Node.js 24.x. Must match the development Node.js version.

**@types/react**: 18.3.31

- **Rationale**: TypeScript definitions for React aligned with the **React 18** major line selected above (runtime 18.3.1). Keeping types and runtime in the same major family avoids type/runtime drift; the newest 18.x patch is used.
  - _Correction note: this document previously recorded `@types/react@19.2.8`. The 19.x types vs 18.3.1 runtime mismatch was closed during the Gate 0 repository-hygiene pass — see Amendment 001._

**@types/react-dom**: 18.3.7

- **Rationale**: TypeScript definitions for React-DOM aligned with the React 18 major line (runtime react-dom 18.3.1); newest 18.x patch.
  - _Correction note: previously recorded `@types/react-dom@19.2.5` — see Amendment 001._

**typescript-eslint**: 8.45.0

- **Rationale**: Stable typescript-eslint major for use with **ESLint 9.x** (typescript-eslint v8 supports `eslint ^8.57.0 || ^9.0.0`). Provides modern TypeScript linting rules.

**eslint-plugin-react**: 7.37.5

- **Rationale**: React-specific linting rules for ESLint.

**eslint-plugin-react-hooks**: 5.2.0

- **Rationale**: Enforces rules of hooks for React.

**eslint-config-prettier**: 10.1.8

- **Rationale**: Disables ESLint rules that conflict with Prettier.

**Zod**: 4.5.4

- **Rationale**: Chosen for the content validation pipeline in WO-010
  (FS-CONTENT-001). RUNTIME dependency under `dependencies` because the game
  ALSO consumes the Zod *types* at runtime for save-format defense (enterprise
  save loading). zod 4 discriminated unions are strict by default (no `.strict()`
  needed); `z.record` requires 2 args (`z.record(z.string(), schema)`).

**YAML**: 2.9.0

- **Rationale**: Authoring format parser used build-time only
  (`tools/validate-content/pipeline.ts`), tag support for AuditingAgent
  test fixtures. Dev dependency.

**tsx**: 4.23.13

- **Rationale**: Runs the `validate:content` CLI without a separate build step
  (`package.json` script). Dev dependency.

## Compatibility Matrix

| Package    | Version | Node.js | TypeScript | Vite | React |
| ---------- | ------- | ------- | ---------- | ---- | ----- |
| TypeScript | 5.9.3   | >= 4.7  | -          | ✓    | ✓     |
| Vite       | 6.4.3   | >= 18   | ✓          | -    | ✓     |
| Phaser     | 3.90.0  | ✓       | ✓          | ✓    | ✓     |
| React      | 18.3.1  | ✓       | ✓          | ✓    | -     |
| Vitest     | 4.1.11  | >= 18   | ✓          | ✓    | ✓     |
| Playwright | 1.62.1  | >= 18   | ✓          | ✓    | ✓     |
| ESLint     | 9.39.5  | >= 18   | ✓          | ✓    | ✓     |
| Prettier   | 3.9.6   | >= 14   | ✓          | ✓    | ✓     |

## Version Selection Principles

1. **Stability over novelty**: Prefer mature, stable releases over cutting-edge versions
2. **Ecosystem compatibility**: Ensure all tools work together seamlessly
3. **LTS alignment**: Align with Node.js LTS for long-term support
4. **Project design compliance**: Follow explicit technology choices from design documents
5. **Risk minimization**: For Vertical Slice, minimize risk by avoiding major version transitions

## Future Considerations

- **Phaser 4 migration**: Requires dedicated ADR with clear benefits analysis
- **React 19 migration**: Consider after React 19 ecosystem stabilizes (6+ months post-release)
- **TypeScript 7**: Consider after stable release and ecosystem validation

## Consequences

### Positive

- Stable, well-tested dependency chain
- Excellent IDE support and debugging tools
- Proven compatibility patterns in community
- Low risk of breaking changes during Vertical Slice development
- Long-term support for all major dependencies

### Negative

- Not using latest major versions (React 19, Vite 8, Phaser 4)
- Will require planned migration path in future if needed

### Neutral

- Lockfile will be generated on first `npm install`
- Exact versions will be recorded in package-lock.json

## References

- [Node.js LTS Schedule](https://nodejs.org/en/about/previous-releases)
- [Phaser 3 Documentation](https://phaser.io/phaser3)
- [Vite Documentation](https://vitejs.dev/)
- [React 18 Documentation](https://react.dev/)
- Project Documentation: START_HERE.md, docs/06_SDD_ENGINEERING_ARCHITECTURE.md

---

## Amendment 001 — Gate 0 repository-hygiene corrections

Date: 2026-08-30

Studio decision (repository hygiene pass, not a version modernization):

1. **`package-lock.json` is now tracked.** npm is the selected package manager
   and lockfile reproducibility is required across human developers and Coding
   Agents. The lockfile is committed going forward; `.gitignore` no longer
   lists it. Dependency versions were **not** otherwise upgraded in this pass.
2. **React types aligned to React 18, matching the runtime.** React / ReactDOM
   runtimes stay at `18.3.1` (chosen for stability in the original decision).
   `@types/react` corrected from `19.2.8` -> `18.3.31`, `@types/react-dom`
   from `19.2.5` -> `18.3.7` (newest 18.x patches), so types and runtime share
   one major family. No React major migration; moving to React 19 still
   requires a future ADR.
3. **Root-cause documented:** the compatibility matrix row read `ESLint 10.9.1`;
   the actually selected/installed version is `eslint@9.39.5`
   (required by the React plugin ecosystem). Matrix and typescript-eslint
   rationale corrected. No installed versions were changed to satisfy the ADR.

This amendment changes documentation and devDependency pins only — no runtime
behavior, no game-system architecture, and no new dependencies were affected.
