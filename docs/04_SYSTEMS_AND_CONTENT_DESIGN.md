# 04 — Systems & Content Design

# 1. Narrative State Model

全局状态禁止任意键值泛滥。分域：

- `storyFlags`
- `questState`
- `relationships`
- `inventory`
- `skills`
- `playerStats`
- `worldState`
- `archive`
- `codex`
- `settings`
- `saveMeta`

Story Flag 格式：
`flag.<chapter>.<subject>.<state>`

Example:
`flag.ch04.camera_test.completed`

---

# 2. Dialogue Runtime

Dialogue Node:
- id
- speaker
- portraitState
- text
- voiceCue?
- tags[]
- onEnterEffects[]
- choices[]
- autoNext?
- cinematicCue?

Choice:
- id
- text
- conditions[]
- skillCheck?
- effects[]
- next
- toneTag

Conditions 只允许声明式：
- flag
- quest
- relationship threshold
- skill
- inventory
- codex
- chapter state

Effects 只允许白名单 command：
- set_flag
- adjust_relationship
- add_item
- remove_item
- add_codex
- quest_event
- award_xp
- play_audio
- emit_narrative_event

禁止 `eval`、动态 JS。

---

# 3. Quest Engine

Quest engine 事件驱动。
Domain event examples:
- `scene.entered`
- `npc.talked`
- `evidence.collected`
- `dialogue.choice_selected`
- `challenge.resolved`
- `item.acquired`
- `world.interaction`
- `chapter.anchor_reached`

Quest definition 监听事件并推进 Objective。

要求：
- deterministic
- replay-safe
- idempotent when processing duplicated events
- serializable state

---

# 4. Skill Check

不要 D20 随机主导叙事。

公式建议：
`score = attribute + skill + evidenceBonus + relationshipBonus + situationalModifier`

三档：
- clear success
- costly success
- failure with consequence

关键科学事实不能因随机失败永久锁死。
技能不足时：
- 获得更少上下文
- 需要额外步骤
- 产生代价
而非永远失去主线。

---

# 5. Scientific Interaction Framework

所有科学玩法统一为：
`Question → Observable → Model → Manipulation → Prediction → Feedback → Reflection`

Example: signal anomaly
- Question: 是设备噪声、环境干扰还是外部规律？
- Observable: 多组日志
- Model: candidate hypotheses
- Manipulation: filter / compare / calibration
- Prediction: if hypothesis true...
- Feedback: evidence match
- Reflection: NPC conversation / archive note

目的是培养方法，而不是让玩家背公式。

---

# 6. Codex

分类：
- People
- Organization
- Science
- Era
- Places
- Technology
- Concepts
- Archive Fragments

Codex entry 有：
- `spoilerTier`
- `unlockedAt`
- `short`
- `expanded`
- `relatedIds[]`
- `sourceContext`

新玩家默认只看到当前时代可理解的信息。
通关后开启完整时间轴关联。

---

# 7. Audio system

Channels:
- master
- music
- ambience
- voice
- sfx
- ui

Features:
- scene ambience layers
- dynamic music state
- dialogue voice cues
- ducking during voice
- fade/crossfade
- subtitle sync metadata
- mute-safe gameplay (never rely on sound only)

Audio cue IDs 由内容数据引用，禁止直接文件路径散落在剧情。

---

# 8. Cinematic system

三种层级：
1. In-engine camera
2. Illustrated motion panel
3. Full-screen timeline montage

Cinematic cue 声明式：
- camera target
- duration
- fade
- shake
- overlay
- caption
- audio cue
- input lock

所有 cinematic 必须可跳过；跳过后状态与完整播放一致。

---

# 9. Era visual language

## Red Coast
- constrained palettes
- paper / analog instruments
- snow, forest, concrete, radio hardware
- deliberate camera

## Modern crisis
- laboratories
- urban night
- digital cameras / screens
- subtle intrusion effects

## Crisis Era
- clean large-scale future urbanism
- public confidence vs hidden fragility
- military UI

## Deterrence
- cultural flourish
- smooth interfaces
- normalized prosperity
- underlying system tension

## Bunker
- enclosed monumental habitats
- artificial skies
- dense layered infrastructure

## Galaxy / Beyond
- sparse UI
- silence
- vast negative space
- human objects become visually tiny

---

# 10. Content budget per main chapter

Target:
- 3–6 exploration scenes
- 2–4 major dialogue scenes
- 1 system challenge
- 1 canon-anchor cinematic
- 3–5 side quests
- 15–30 inspectables
- 10–20 ambient NPC lines
- 5–10 Codex unlocks
- 1–3 archive echoes to later eras

这是预算，不是硬性 KPI。质量优先于填数量。
