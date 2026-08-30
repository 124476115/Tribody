# 《三体：时间之外》Web RPG — START HERE

> 项目代号：**Project Trisolaris Chronicle**
>
> 目标：构建一款可直接在现代浏览器运行的、以《三体》三部曲宏观时间轴为骨架、以原创玩家视角穿行关键历史节点的中型叙事 RPG。
>
> 本包用于直接交给 CodingAgent / Google Jules / Gemini 类 Coding Agent。**Agent 必须先读本文件，再读根目录 `AGENTS.md`，然后严格按照 `execution/MASTER_EXECUTION_ORDER.md` 工作。**

---

## 1. 一句话产品定义

这不是“《三体》剧情百科 + 对话框”，也不是强行加入刷怪的传统 RPG。

它是一款 **2D/2.5D 叙事 RPG**：玩家在红岸、危机纪元、威慑纪元、广播纪元、掩体纪元与银河时代之间，通过探索、人物对话、调查、科学推演、社会博弈、危机行动、舰队战术和角色成长，亲历人类文明面对未知宇宙时的选择。

核心体验：

1. **宏观历史不可随意改写，微观人生可以被玩家改变。**
2. **科学不是装饰，而是可互动的推理与机制。**
3. **哲学不是说教，而是通过选择后果显现。**
4. **经典事件由玩家“在场经历”，而不是长篇旁白复述。**
5. **普通人的食物、住房、工作、家庭、娱乐、恐惧与希望，与文明级危机同屏存在。**

---

## 2. 版权与发布边界（必须遵守）

本项目包提供的是**改编设计与原创交互表达框架**，不复制原作长段文字、原句对白、官方影视画面、演员声音、官方音乐或受保护美术资产。

开发阶段：

- 剧情内容使用“事件摘要 + 原创玩家支线 + 原创对白”。
- 经典人物作为关键 NPC，但不大段复刻原书对白。
- 所有美术、音乐、语音先使用原创/授权/占位资产。
- 禁止模仿真实演员声线做未授权语音克隆。

若计划公开发行、收费、商业化、品牌合作或在应用商店正式上架，应由项目方在发行前取得相应小说/世界观/角色改编授权并完成法律审核。

见：`docs/12_IP_RIGHTS_AND_CONTENT_POLICY.md`

---

## 3. 成功标准

### 玩家层
- 不熟悉《三体》的玩家，不阅读外部资料也能理解主要人物、时代转换、科学概念与文明处境。
- 熟悉原作的玩家能识别关键事件、时代质感和主题，但仍能发现足够多新的可玩细节。
- 连续 30 分钟体验中，至少发生：探索、人物互动、角色成长、任务推进、一次系统性冲突、一次世界观知识解锁。
- 对话不是单向朗读：关键场景至少包含信息追问、态度选择、技能检定或后果反馈之一。

### 工程层
- 主线流程在 Chrome / Edge / Firefox 桌面版可通关。
- 核心游戏逻辑与 Phaser 渲染解耦，可以在 Node 测试环境运行。
- Save 数据版本化，可迁移，可导入导出。
- 每个系统均有 SDD；每个核心规则先有测试再实现。
- `npm run quality` 必须在每个 Work Order 结束时通过。
- Playwright 覆盖新游戏→首章→任务→对话→战斗/冲突→存档→读档的关键路径。

---

## 4. 推荐产品形态

### 客户端
- Browser-first
- TypeScript
- Vite
- Phaser 3：地图、人物、动画、镜头、碰撞、粒子
- React：菜单、背包、技能树、任务日志、对话辅助 UI、设置
- Zustand：客户端状态协调
- Zod：内容与存档运行时校验
- Howler.js / Web Audio：音乐、环境音、语音
- IndexedDB：主存档
- localStorage：极少量设置和最近存档索引
- Vitest：单元/领域测试
- Playwright：E2E
- ESLint + Prettier + TypeScript strict

**版本不要在设计阶段盲目写死。Bootstrap Work Order 中由 Agent 查询当时兼容的稳定版本，并把最终选型写入 ADR。**

---

## 5. 首发范围与完整蓝图

本设计文档覆盖三部曲完整时间线，但工程必须按风险递减路线开发。

### Vertical Slice
先做“现代危机开端”约 30–45 分钟纵切片：
- 城市/研究机构探索
- NPC 对话
- 倒计时异常
- 科学调查
- 三体游戏首次进入
- 一次非致命危机冲突
- 等级/技能/装备
- 任务日志
- Codex
- 音频
- 存档/读档

纵切片不是 Demo 假壳；它必须使用最终架构。

### Full Campaign
完整设计分 6 幕：
1. 火种：红岸与第一次回应
2. 倒计时：现代科学危机与 ETO
3. 面壁：危机纪元与人类战略
4. 黑暗森林：水滴、威慑与文明选择
5. 威慑之后：广播、澳大利亚与掩体时代
6. 时间之外：二维化、银河文明与宇宙归还

---

## 6. Agent 的唯一主路径

不要从任意文件随机开工。

1. 读 `AGENTS.md`
2. 读 `docs/00_PRODUCT_CHARTER.md`
3. 读 `docs/01_NARRATIVE_BIBLE.md`
4. 读 `docs/02_TIMELINE_AND_CHAPTERS.md`
5. 读 `docs/03_GAME_DESIGN_GDD.md`
6. 读 `docs/06_SDD_ENGINEERING_ARCHITECTURE.md`
7. 读 `docs/07_TDD_AND_TEST_STRATEGY.md`
8. 读 `execution/MASTER_EXECUTION_ORDER.md`
9. 只执行当前 Work Order
10. 通过 Gate 后再进入下一个 Work Order

任何实现与文档冲突时：
- **故事/产品意图**：Narrative Bible / GDD 优先。
- **接口和数据契约**：Feature Spec 优先。
- **架构约束**：Architecture + ADR 优先。
- **测试行为**：若测试与最新 Spec 冲突，先修测试，不允许为了“绿灯”扭曲需求。

---

## 7. 交付定义

“完成”不是“页面能打开”。

最终 Release Candidate 必须包含：
- 可玩的完整主线
- 教程、设置、字幕、音量
- 任务/等级/技能/装备/勋章
- NPC 对话与关系
- 章节选择（通关后）
- 背景音乐、环境音、对白语音接口
- 本地存档、自动存档、手动存档、导入导出
- Codex / 科学概念库 / 人物档案 / 时代档案
- 端到端测试
- 内容校验工具
- 性能预算检查
- Release checklist
- 开发者文档

---

## 8. 设计原则简表

- **Canon Anchors**：大历史节点锁定。
- **Human Ripples**：小人物后果可变。
- **Science as Play**：科学概念必须落到交互。
- **No Lore Dumping**：重要世界观分散在场景、任务、对话、物件与 Codex。
- **Quiet Before Vastness**：宏大演出前保留日常生活呼吸感。
- **Choices Reveal Values**：选择体现价值观，不做简单善恶条。
- **Failure Is Content**：失败通常产生不同成本/路线，而不是立即 Game Over。
- **Readable Browser RPG**：首先保证交互清晰、加载可控、存档可靠。

---

## 9. 第一条给 CodingAgent 的提示词

复制 `agent_prompts/00_BOOTSTRAP_PROMPT.md` 的全文作为第一条任务即可。
