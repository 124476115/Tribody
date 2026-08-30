# MASTER EXECUTION ORDER

CodingAgent: this is the authoritative work sequence.

Do not attempt to “build the whole game in one task.”

# Gate 0 — Repository contract

Execute:
- WO-000 Bootstrap
- WO-001 Quality pipeline
- WO-002 Domain event kernel

Exit:
- empty game shell boots
- tests/build/typecheck/lint pass
- architecture directories exist
- ADRs written

# Gate 1 — Narrative vertical slice foundation

Execute:
- WO-010 Content schema
- WO-011 Dialogue engine
- WO-012 Quest engine
- WO-013 Save system
- WO-014 Exploration interaction

Exit:
- data-driven scene
- interactable NPC
- branching dialogue
- quest progression
- save/reload restores exact state

# Gate 2 — RPG progression

Execute:
- WO-020 Character/XP
- WO-021 Skills/checks
- WO-022 Inventory/equipment
- WO-023 Relationships/medals/codex

Exit:
- player can earn XP, level, learn skill, equip item
- skill and evidence influence dialogue/challenge
- relationship consequence persists

# Gate 3 — Presentation

Execute:
- WO-030 React HUD/menus
- WO-031 Audio
- WO-032 Cinematics
- WO-033 Accessibility/settings

Exit:
- vertical slice feels like a game, not debug harness

# Gate 4 — Vertical Slice: CH03–CH06 excerpt

Execute:
- WO-040 Modern city/lab scene pack
- WO-041 Countdown investigation
- WO-042 Observatory scene
- WO-043 Three-Body simulation scene
- WO-044 Vertical-slice E2E + polish

Exit:
- 30–45 minute coherent playable slice
- new player comprehension playtest ready

# Gate 5 — Campaign production

One act at a time:
- Act I Embers
- Complete Act II
- Act III
- Act IV
- Act V
- Act VI

For each Act:
1. Narrative beat lock
2. Content specs
3. System gaps
4. Content implementation
5. Act E2E
6. Save migration fixture
7. Playtest
8. Rewrite
9. Gate review

# Gate 6 — RC

- rights review
- complete QA
- browser matrix
- performance
- accessibility
- localization
- save backward compatibility
- production asset manifest
- release checklist

# Agent decision rule

If current task reveals architecture debt that blocks later work:
1. open ADR
2. add minimal refactor Work Order
3. keep current acceptance criteria visible
4. do not perform unrelated rewrite

# No silent scope change

Any proposed change to:
- camera model
- engine
- content language
- save format
- protagonist structure
- canon model
requires ADR + Design Impact section.
