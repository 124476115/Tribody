# 12 — IP, Rights & Content Policy

# Design stance

The project is an adaptation blueprint. Engineering can proceed with placeholders and original expressive text, but release rights are a separate gate.

# Must not ship without permission/license review

- novel title/branding if protected for commercial use
- copyrighted long-form text
- official book illustrations
- TV/film imagery
- actor likeness used as a deliberate copy
- actor voice clone
- soundtrack recordings
- logos from official adaptations

# Allowed development placeholders

- original character silhouette/portrait
- original ambient music
- text summaries of events
- original dialogue that conveys the designed interaction
- generic science diagrams
- original UI

# Dialogue rule

Do not paste novel paragraphs into content files.
If a line is iconic and legally approved later, add it through a clearly tagged licensed-content layer:
`licensedText: true`
with rights record.

# Rights manifest

Before RC, every asset should resolve to:

- Original
- Commissioned with license
- Third-party licensed
- Public domain (verified)
- Adaptation-rights content

Unknown = build warning in development; release blocker in RC.

# Fan prototype note

Even a noncommercial fan project can raise IP issues depending on distribution and jurisdiction. Project owner should obtain professional legal advice before public release.
