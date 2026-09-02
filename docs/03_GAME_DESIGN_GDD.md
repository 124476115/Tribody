# 03 — Game Design Document (GDD)

# Core loop

`Explore → Talk → Investigate → Decide → Resolve Conflict → Grow → Archive → Advance Era`

## Exploration

- tile/map navigation
- interactable hotspots
- contextual actions
- hidden evidence
- environmental storytelling
- optional NPC conversations

## Dialogue

- portrait + scene context
- choices
- skill checks
- evidence references
- relationship state
- timed choices only in high-pressure scenes; default untimed for accessibility

## Investigation Board

玩家收集：

- Evidence
- Hypothesis
- Person
- Event
- Unknown

可建立连接。
系统只在关键逻辑上验证，不要求把所有卡片机械相连。

## Conflict modes

### 1. Social Conflict

资源：

- Composure
- Leverage
- Trust
- Evidence

动作：

- Ask
- Press
- Reframe
- Reveal Evidence
- Withdraw
- Commit

### 2. Scientific Challenge

资源：

- data sets
- parameters
- instruments
- time budget

胜利条件：

- 提出通过最低证据阈值的可证伪解释
- 或正确识别“现有理论无法解释”

### 3. Field Crisis

半实时/暂停制：

- Move
- Interact
- Assist
- Repair
- Scan
- Cover
- Evacuate

避免以击杀为主。

### 4. Tactical Command

用于舰队/大型系统：

- command map
- limited orders
- information delay
- uncertain contacts
- resource allocation

结果重点在任务损失和救援，不让玩家逆转 Hard Canon。

---

# Character progression

## Level

角色每个时代独立等级，建议 1–20。
经验来源：

- Main quest
- Side quest
- Discovery
- Science Insight
- Relationship breakthrough
- Crisis resolution

**不因重复刷同一 NPC/小游戏无限获得经验。**

## Attributes

六属性，1–10：

- Insight 洞察
- Reason 推理
- Resolve 定力
- Empathy 共情
- Systems 系统思维
- Fieldcraft 实务

不设 Strength / Dexterity 作为主属性，因为项目核心不是物理战斗。

## Skill trees

### Investigator

- Pattern Recognition
- Interview
- Surveillance Awareness
- Evidence Reconstruction

### Scientist

- Experimental Design
- Signal Analysis
- Model Testing
- Cosmology Literacy

### Operator

- Repair
- Emergency Response
- EVA
- Navigation

### Strategist

- Risk Analysis
- Resource Command
- Deception Detection
- Long Horizon

### Humanist

- De-escalation
- Empathy
- Cultural Memory
- Group Cohesion

技能升级常带“新动作”而不只数值 +5%。

---

# Equipment

装备槽：

- Tool
- Device
- Clothing/Suit
- Access Credential
- Keepsake

示例：

- Field notebook
- Spectral sensor
- Secure terminal
- Laboratory access badge
- Cold-weather gear
- Pressure suit
- Portable drone
- Navigation unit
- Archive key
- Family photograph / keepsake

Keepsake 可提供对话/稳定性效果，强调人与历史。

---

# Medals / Achievements

勋章分三类：

### Mastery

- Scientific Method
- Crisis Operator
- Archive Keeper

### Discovery

- 找到完整时代档案
- 发现跨时代支线回响

### Values

不叫“道德成就”，而叫“观点印记”：

- Preserve the Few
- Preserve the Record
- Radical Transparency
- Quiet Resolve
- Long Horizon

同一轮不要求全部获得。

---

# Relationship system

每 NPC 保存多维关系：

- trust
- respect
- familiarity
- tension
- debt

范围建议 -100..100，但 UI 不直接显示数字。
显示语言：

- guarded
- open
- relies on you
- disagrees but respects you
  等。

经典人物关系值不允许改变其 Hard Canon 行为。

---

# Quest model

Quest states:
`locked → available → active → blocked(optional) → resolved_success/resolved_costly/resolved_failure → archived`

Quest Objective 类型：

- go_to
- interact
- collect_evidence
- talk
- choose
- survive
- repair
- analyze
- escort
- wait_for_event
- custom_domain_event

每个主线 Quest 必须：

- 至少 1 个显式目标
- 提供 journal summary
- 可恢复
- 有 soft-lock 防护
- 结束后写入 archive event

---

# Economy

不做传统金币驱动。

不同年代使用不同“资源语境”：

- supply credit
- project budget
- access authorization
- time
- oxygen/energy
- fabrication allowance

商店/补给系统主要支持：

- 可选工具
- 消耗品
- 外观
- 生活物件
  而不是无止境数值膨胀。

---

# Failure design

失败优先转化为：

- lost trust
- extra resource cost
- missing optional evidence
- injured NPC
- reduced later support
- alternate scene

只有以下情况 Game Over：

- 明确死亡危险且无合理叙事恢复
- 核心任务完全失败且世界逻辑不允许继续

Game Over 前至少有清晰预警和最近 autosave。

---

# Difficulty

Modes:

- Story
- Standard
- Analyst

区别：

- 线索提示
- 时间压力
- 冲突容错
- 资源压力

不改变核心剧情内容。

---

# New Game+

保留：

- Codex
- Medals
- Timeline annotations
- Optional meta commentary unlock

不保留：

- 大部分时代角色等级
- 主线关键道具
- 会破坏剧情认知顺序的证据

---

# Save system UX

Slots:

- 3 manual
- rotating autosaves 5
- quick save 1 (non-cinematic only)

Save metadata:

- version
- chapter
- scene
- playtime
- player level
- timestamp
- thumbnail optional
- content manifest version

支持：

- export JSON
- import JSON
- integrity validation
- schema migration
- corrupted save recovery to last valid autosave
