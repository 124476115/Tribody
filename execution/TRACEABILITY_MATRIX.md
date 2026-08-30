# Requirements ↔ Specs ↔ Tests Traceability Matrix

Agent maintains this file after each Gate.

| Requirement | Spec | Unit | Integration | E2E | Gate |
|---|---|---|---|---|---|
| Browser boot | WO-000 | smoke | — | boot | G0 |
| Typed event kernel | FS-EVENTS-001 | `tests/unit/events/*.test.ts` (serialization, ids, duplicates, unknown-events, sequence, determinism, transactional, commands) | `tests/integration/events-roundtrip.test.ts` | — | G0 |
| Data-driven dialogue | FS-DIALOGUE-001 | required | required | conversation | G1 |
| Quest progression | FS-QUEST-001 | required | required | quest path | G1 |
| Save/load | FS-SAVE-001 | required | required | reload | G1 |
| Exploration interaction | FS-EXPLORE-001 | small | required | move/interact | G1 |
| XP/levels | FS-PROG-001 | required | required | progression | G2 |
| Skills/checks | FS-SKILL-001 | required | dialogue integration | skill choice | G2 |
| Equipment | FS-INV-001 | required | required | equip | G2 |
| Relationships | FS-REL-001 | required | dialogue | consequence | G2 |
| Audio | FS-AUDIO-001 | adapters | scene integration | settings smoke | G3 |
| Cinematic skip invariant | FS-CINE-001 | required | required | skip | G3 |
| Accessibility | FS-A11Y-001 | selected | UI integration | keyboard | G3 |
| Vertical slice | chapter specs | all relevant | all relevant | golden path | G4 |

Do not mark a cell complete without pointing to actual test file in the implementation repo.
