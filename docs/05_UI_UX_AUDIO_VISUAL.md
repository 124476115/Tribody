# 05 — UI / UX / Audio / Visual Direction

# Screen layout

Exploration:

- Phaser canvas full viewport
- React HUD overlay
- top-left: current objective (collapsible)
- bottom-left: context action
- top-right: lightweight status / location
- no permanent minimap in intimate scenes; optional in larger spaces

Dialogue:

- character portrait or in-scene focus
- speaker
- text
- evidence/skill tags only when relevant
- choice wheel/list
- history log
- auto / speed / skip read text
- voice replay

Menus:

- Journal
- Character
- Skills
- Inventory
- Archive
- Codex
- Timeline
- Settings
- Save

# Visual hierarchy

Important:

- scene first
- characters second
- text third
- system numbers last

不要把游戏做成 UI 仪表盘。

# Accessibility

Required:

- font size 100/125/150%
- line spacing option
- dyslexia-friendly fallback font option
- high-contrast UI
- color-independent state icons
- subtitles
- speaker labels
- subtitle background opacity
- reduce camera shake
- reduce flashes
- reduce motion
- hold/toggle options
- remappable keyboard controls
- mouse-only critical path
- gamepad optional
- no audio-only puzzle
- no color-only science puzzle
- dialogue time limits off in Story mode

# Localization

Content architecture must support:

- zh-CN first
- en second-ready

No string concatenation for grammatical sentences.
UI layout tested with +30% expansion.
Dialogue data uses localization keys in production, not text hardcoded in code.

# Audio direction

Music should emphasize:

- texture
- distance
- pressure
- human warmth

Avoid constant “epic sci-fi” music.

Use silence deliberately:

- before/after major cosmic events
- in observatory sequences
- in archive moments

Voice:

- full voice is optional by budget
- architecture supports partial voice
- minimum: key character lines + cinematics
- all voice has subtitle fallback

# Browser asset strategy

- initial shell lightweight
- chapter packs lazy-loaded
- texture atlases
- audio compressed with fallback
- prefetch next scene while current scene has dialogue/exploration
- low-memory mode can unload previous chapter pack

# Performance targets

Engineering targets:

- 60 FPS desktop target
- graceful 30 FPS fallback on low-end integrated graphics
- no long main-thread blocking while loading chapter content
- code bundle separated from chapter assets
- memory leak test across 10 scene transitions
- audio objects released on chapter unload
