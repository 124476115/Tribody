# WO-011 — Dialogue Engine

Spec: `FS-DIALOGUE-001`.

Features:
- start dialogue
- node advance
- choice
- conditions
- whitelisted effects
- skill check hook
- history
- saveable state
- no eval

Acceptance:
- branching sample from `content_examples/dialogue_ch04_sample.yaml`
- effect exactly once
- inaccessible choice hidden/disabled per spec
- auto-next cycle detected
