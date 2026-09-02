# 10 — QA, Performance, Accessibility, Release

# Release gates

## Functional

- main campaign finishable
- no quest soft lock
- no missing mandatory assets
- save/load stable
- chapter transitions stable

## Narrative

- canon order review
- first-time comprehension review
- spoilers correctly gated
- no unlicensed copied dialogue
- no placeholder author notes exposed

## Performance

- profile representative low/mid/high machines
- scene transition memory trend
- long session (>2h) stability
- audio leak check
- asset pack unloading
- no giant eager-loaded campaign bundle

## Accessibility

- keyboard-only critical path
- mouse-only critical path
- readable at 150% text
- subtitles
- reduced motion
- no color-only state
- focus visible in menus

## Browser

At minimum current stable:

- Chrome
- Edge
- Firefox

Safari can be a supported target after audio/autoplay/pointer/save behavior is verified.

# Checkpoint recovery

Autosave before:

- major chapter transition
- dangerous crisis
- irreversible dialogue commit

Autosave after:

- canon anchor
- boss-equivalent conflict
- major quest resolution

# Release build

Required scripts:

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run test`
- `npm run test:e2e`
- `npm run validate:content`
- `npm run quality`

# Bug severity

P0:

- data loss
- cannot boot
- remote execution/security
- campaign impossible for all players

P1:

- main quest soft lock
- save migration failure
- major browser break
- mandatory dialogue missing

P2:

- side quest failure
- visual/audio major defect
- serious accessibility failure

P3:

- polish
- typo
- minor animation
