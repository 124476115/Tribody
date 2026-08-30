# AGENTS.md

本仓库由人类负责人 + CodingAgent 协作开发。所有 Agent 必须遵守以下规则。

## Mission

构建 `Project Trisolaris Chronicle`：浏览器叙事 RPG。优先级依次为：

1. 叙事完整性
2. 可验证的游戏规则
3. 存档可靠性
4. 可维护的内容生产管线
5. 浏览器性能
6. 美术与演出提升

禁止为了“看起来进度很快”跳过测试、数据验证、内容管线或存档迁移设计。

## Mandatory workflow: SDD → TDD → Implementation

每项功能按以下顺序：

1. Locate or create Feature Spec.
2. 完成 Problem / Scope / UX / Domain Model / Data Contract / Acceptance Criteria.
3. 写失败测试（Red）。
4. 实现最小代码（Green）。
5. Refactor。
6. 添加集成/E2E 测试。
7. 更新 Spec 的 Implementation Notes。
8. 运行 `npm run quality`。
9. 输出变更摘要、测试证据、已知风险。
10. 不得越过 Work Order Gate。

## Never do

- 不得把复杂规则直接写进 Phaser Scene。
- 不得把任务逻辑散落在 UI 组件。
- 不得在对话 JSON 中执行任意 JS。
- 不得使用 `any` 逃避类型系统。
- 不得在未迁移的情况下修改 Save schema。
- 不得在没有唯一 ID 的情况下新增 NPC / quest / item / dialogue node。
- 不得让主要剧情完全依赖玩家碰巧捡到的可错过物品。
- 不得用长篇静态文字替代应当可玩的事件。
- 不得复制原作大段文字或未授权影视对白。
- 不得加入“改写宇宙级正史结局”的分支，除非 Narrative Bible 明确批准。
- 不得直接将新的第三方库加入主分支；先写 ADR 或在当前 Work Order 中说明必要性。

## Layering

`src/domain`
- 纯 TypeScript。
- 无 Phaser / React。
- 规则、实体、状态机、计算、条件表达式。
- 必须是单元测试最密集区域。

`src/application`
- Use Cases、commands、event orchestration、save/load、quest progression。

`src/adapters`
- IndexedDB、audio、input、content loading、telemetry interface。

`src/game`
- Phaser scenes/entities/rendering/camera/animation。

`src/ui`
- React HUD / menus / dialogue shell / inventory / skill tree / journal / settings。

`content`
- YAML/JSON narrative content.
- 构建时和运行时均校验。

## IDs

格式：
- Chapter: `ch_<era>_<nn>_<slug>`
- Scene: `sc_<chapter>_<nn>_<slug>`
- NPC: `npc_<slug>`
- Quest: `q_<chapter>_<slug>`
- Dialogue: `dlg_<slug>`
- Item: `item_<category>_<slug>`
- Skill: `skill_<tree>_<slug>`
- Medal: `medal_<slug>`
- Codex: `codex_<category>_<slug>`

ID 永久稳定；发布后禁止无迁移重命名。

## Commit / task sizing

一个 Agent Task 只解决一个 Work Order 或一个明确子任务。
若涉及超过 3 个功能域，先拆分。
每次修改必须说明：
- Why
- What
- Tests
- Data migration
- Player-visible impact
- Risks

## Definition of Done

- Spec acceptance criteria 全部可追踪到测试。
- Unit tests pass.
- Integration tests pass.
- Required E2E pass.
- Typecheck pass.
- Lint pass.
- Content validation pass.
- Save compatibility test pass（若相关）。
- 无阻断级 console error。
- 变更文档已更新。
- Work Order Gate 被满足。

## Narrative invariants

1. Macro canon anchors 不因普通选择改变。
2. 玩家改变的是“抵达方式、付出代价、关系、支线人物、认知与视角”。
3. 科学概念应通过任务/模型/证据链教学，而不是百科灌输。
4. 每个宏观章节至少安排一个微观日常场景。
5. 每个时代必须在美术、环境音、UI、语言习惯、资源供给上有差异。
6. 经典人物的原创对白必须符合角色功能和时代语境，但不得伪装成原著原句。
7. 任何涉及真实政治创伤、群体暴力、死亡的场景，禁止游戏化奖励暴力本身。

## Agent status report template

任务结束输出：

### Completed
- ...

### Acceptance criteria
- AC-01: PASS — test/path
- ...

### Verification
- `npm run quality`: PASS
- E2E: ...

### Files changed
- ...

### Risks / debt
- ...

### Next allowed Work Order
- WO-...
