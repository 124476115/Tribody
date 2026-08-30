# 11 — Risk Register

| Risk | Impact | Probability | Mitigation |
|---|---|---:|---|
| Scope explosion across trilogy | Critical | High | Vertical slice + act gates; full timeline designed but content added sequentially |
| Becomes visual novel, not RPG | High | High | Every chapter requires exploration + system challenge + character growth |
| Becomes generic combat RPG | High | Medium | Conflict mode spec; XP not tied to kills |
| Canon errors | High | Medium | Canon anchor sheet + review gate |
| Copyright/licensing | Critical | Medium | No copied long text/assets; rights metadata; legal gate before release |
| Agent code drift | High | High | AGENTS.md + Work Orders + SDD + tests + ADRs |
| Save corruption | Critical | Medium | schema version + migration fixtures + checksum |
| Content graph breaks | High | High | build-time referential validation |
| Browser memory/audio leaks | High | Medium | asset pack lifecycle tests |
| Huge asset download | High | High | chapter lazy loading |
| Science becomes textbook | Medium | High | Science-as-play framework |
| Philosophy becomes preaching | High | Medium | competing NPC perspectives + consequences |
| Future eras lack human warmth | High | Medium | micro-life checklist mandatory |
| Classic characters overshadow player | Medium | High | player handles local problems with persistent side effects |
| Player choices feel fake | High | Medium | relationship/cost/side NPC/archive consequences |
