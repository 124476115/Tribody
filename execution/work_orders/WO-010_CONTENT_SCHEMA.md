# WO-010 — Content Schema

Implement authoring + validation for:
- chapter
- scene
- npc
- dialogue
- quest
- item
- skill
- codex
- audio cue

Use Zod or equivalent selected in ADR.

Build referential integrity validator.

Acceptance:
- broken next-node fails
- missing NPC fails
- duplicate ID fails
- valid example builds normalized manifest
