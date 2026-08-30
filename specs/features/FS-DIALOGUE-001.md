# FS-DIALOGUE-001 — Dialogue Runtime

## Status
Approved for implementation

## Problem
Game requires character-driven interactive scenes that can query state and produce controlled state changes without embedding executable code in narrative files.

## Player value
Conversation feels interactive and remembers what player has learned/done.

## Scope
In:
- linear/branching nodes
- choices
- condition visibility
- skill check route
- evidence route
- whitelist effects
- history
- voice cue id
- save/resume

Out:
- LLM-generated live dialogue
- arbitrary scripting
- lip sync

## State
`idle → active(node) → awaitingChoice → transitioning → active/ended`

## Invariants
- active node must exist
- next node must exist or end
- effects execute at most once per transition
- unknown effect is content validation error
- canon protected effects rejected

## Acceptance criteria
- AC-01 Start at entry node.
- AC-02 Conditional choices use current GameSnapshot.
- AC-03 Choice can dispatch whitelisted effects.
- AC-04 Effects execute once.
- AC-05 Save/resume returns to same active node/choice state.
- AC-06 Cyclic auto-next is rejected.
- AC-07 Canon namespace cannot be mutated by ordinary dialogue.
- AC-08 Missing localization key fails production content build.
