# 《三体：时间之外》Web RPG — Master Design & Engineering Document

> 此文件是核心文档的合并阅读版；CodingAgent 仍应按 START_HERE.md / AGENTS.md / Work Orders 的顺序执行。


---


<!-- SOURCE: START_HERE.md -->

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


---


<!-- SOURCE: docs/00_PRODUCT_CHARTER.md -->

# 00 — Product Charter

## Vision

把《三体》的“宏观宇宙尺度 + 微观普通人生活 + 科学思想实验 + 文明抉择”转化为玩家可以亲历的 RPG 语言。

玩家最终应产生的不是“我看完了一个剧情”，而是：
- 我曾在一个普通夜晚发现物理学似乎失效。
- 我曾和一个惶恐的人讨论工作、家庭和世界末日。
- 我曾因为一个看似理性的决定伤害某个具体的人。
- 我理解了为什么某些人物选择沉默、威慑、逃亡或坚持。
- 我看见人类从拥挤城市到太空文明，再从太阳系尺度跌入更宏大的宇宙秩序。

## Target audience

Primary:
- 15+ 科幻、叙事 RPG、悬疑、策略玩家
- 熟悉或不熟悉小说均可

Secondary:
- 对科学史、宇宙学、社会选择、哲学讨论感兴趣的玩家

## Experience pillars

### P1. Living history
每个时代不只展示“大事件”，还要展示房间、街道、食堂、工作台、通勤、消费、新闻、家庭关系。

### P2. Participatory science
科学概念通过交互任务：
- 证据排序
- 假设验证
- 模型操作
- 参数调试
- 观测比对
- 战略推演

### P3. Meaningful social interaction
对话选项影响：
- 信任
- 信息开放度
- 支线入口
- 支援能力
- 任务代价
- 玩家思想档案

但重要角色不应因为“送礼刷好感”就违反核心人格。

### P4. Macro inevitability, micro agency
大尺度节点是历史锚点；玩家可以改变局部生命轨迹与体验视角。

### P5. Emotional contrast
规律：
`日常安静 → 异常侵入 → 认知升级 → 选择压力 → 宏大演出 → 余波中的日常`

## Genre & camera

- 2D/2.5D narrative RPG
- top-down/isometric exploration
- portrait dialogue
- cinematic illustrated panels for civilization-scale events
- tactical overlays for fleet / strategic moments
- limited real-time action for danger sequences

## Session model

- 20–60 minute natural play sessions
- scenes generally 3–12 minutes
- autosave on scene transition / major dialogue / quest checkpoint
- manual save outside hard cinematic segments

## Rating / sensitive material

Target equivalent: Teen / 16+.
Includes:
- historical violence
- suicide references / existential despair
- large-scale death
- authoritarian/social conflict
- disaster imagery

Design must provide:
- content warnings in settings
- skip/soften high-intensity historical imagery
- no reward loop for cruelty

## Monetization recommendation

For a narrative adaptation:
- premium one-time purchase or licensed platform release is preferable to gacha/live-service.
- Avoid stamina, randomized loot, paid power.
- DLC only适合额外原创人物支线或幕后资料，不切割主线结局。

## KPI-like product quality indicators

Not business analytics, but internal quality:
- Story comprehension checkpoint ≥ 80% in playtest
- Players can explain one scientific concept per act in their own words
- Main quest soft-lock rate = 0
- Save corruption rate = 0 in automated migration suite
- Tutorial abandonment monitored around first 20 minutes
- Dialogue skip rate used as a signal, not automatically treated as failure


---


<!-- SOURCE: docs/01_NARRATIVE_BIBLE.md -->

# 01 — Narrative Bible

## Narrative thesis

核心命题不是“外星人来了怎么办”，而是：

> 当一个文明发现自己并不处于安全、中心或永恒的位置时，个体如何继续生活？理性、道德、生存和爱之间是否存在永远正确的排序？

游戏不替玩家回答。系统负责让选择变得具体、有代价。

## Canon model

内容分四层。

### Tier A — Hard Canon Anchor
必须发生且结果固定的大节点，例如：
- 红岸相关首次宇宙回应与后续链条
- 现代科学危机
- ETO 被摧毁 / 信息被获取
- 智子封锁背景
- 面壁计划
- 末日之战与水滴灾难
- 黑暗森林威慑形成
- 威慑交接后的重大转折
- 引力波广播相关事件
- 掩体纪元与光速/黑域路线
- 太阳系最终灾难
- 银河末期与小宇宙/大宇宙主题

玩家不能“SL 一次把大历史改掉”。

### Tier B — Canon Elastic
结果不改变，但玩家可以改变：
- 自己是否亲眼看到
- 获得信息的顺序
- 协助哪个小组
- 任务损失
- NPC 对玩家的评价
- 事件后的资源/伤情/支线

### Tier C — Original Human Layer
原创可变层：
- 玩家角色家人
- 同事
- 普通研究员
- 医生
- 食堂员工
- 城市居民
- 太空站维修人员
- 舰队低级军官
- 掩体城家庭
- 银河殖民者

这里是传统 RPG 自由度的主要来源。

### Tier D — Interpretive Layer
不宣称“作者唯一答案”的哲学讨论：
- 生存主义
- 技术乐观
- 威慑伦理
- 逃亡主义
- 集体责任
- 个体尊严
- 信息透明
- 风险偏好

通过“观点档案”记录玩家倾向，但永不显示“善恶值”。

---

# Player identity

采用“时代接力式主角群”，而不是让一个人不合理地活过数百年。

共同纽带是一个跨时代保存的 **文明观察档案 Chronicle Archive**。每一代玩家角色留下：
- 任务记录
- 私人笔记
- 科学模型
- 人际关系摘要
- 物件
- 未解决问题

后世角色可以读取前代档案。玩家在元层面保留：
- Codex
- 勋章
- 已发现历史注脚
- 观点画像
- New Game+ 的少量非破坏性知识便利

## Four original player lineages

### A. Lin Qiao / 林乔 — 红岸时代
定位：年轻无线电/气象技术员，因工作被调入偏远设施外围技术体系。
作用：
- 让玩家从普通技术人员视角接近时代与红岸
- 不替代叶文洁的关键选择
- 展示劳动、物资、政治语言和私人困惑

核心技能：工程、观察、谨慎沟通。

### B. Chen Mo / 陈默 — 现代科学危机
定位：纳米材料团队的数据工程/实验协作人员，与王淼项目有业务交集。
作用：
- 主纵切片角色
- 在大史强介入前先从“工作异常”切入
- 与警务、研究机构、前沿科学圈发生交集

核心技能：调查、实验、数据分析、社交。

### C. Xu Ran / 徐然 — 危机纪元
定位：战略情报与航天联合体系的年轻联络官，可在冬眠后继续承担任务。
作用：
- 从“普通执行人员”看面壁、舰队、社会转向
- 与太空军、舰队、平民生活连接

核心技能：战略、组织、战术、航天。

### D. An Ning / 安宁 — 威慑后至银河
定位：历史档案继承者；最初是城市社会系统工程师，后参与远航/档案保存。
作用：
- 把普通公民生活、制度选择和宇宙级结局连接
- 最终完成 Chronicle Archive

核心技能：系统工程、外交、适应、宇宙航行。

角色名均为开发占位，可在版权与叙事顾问审校后调整。

---

# Classic character interaction rules

经典人物应被设计为“引力中心 NPC”，不是给玩家派十个杂务任务的普通 Quest Giver。

## Ye Wenjie
玩家体验重点：
- 一个个体如何在社会创伤、科学理性和文明失望中形成选择。
- 她的关键历史决定不可由玩家代替。
- 玩家可以获得不同深度的理解，但不做简单“洗白/反派化”。

## Wang Miao
玩家体验重点：
- 科学家的日常秩序被不可解释现象侵入。
- 玩家与其协作，不取代其学术身份。

## Shi Qiang
玩家体验重点：
- 经验主义、现实感、对人的观察。
- 他让宏观阴谋保持“地面触感”。

## Luo Ji
玩家体验重点：
- 从个人疏离到承担文明级威慑。
- 玩家帮助系统运行、观察社会反应，不把核心发现改写为玩家功劳。

## Zhang Beihai
玩家体验重点：
- 长期主义、行动一致性、隐藏意图。
- 允许玩家事后重构其证据链，而不是提前轻易“看穿”。

## Cheng Xin
玩家体验重点：
- 道德选择与生存逻辑之间的冲突。
- 不将她简化为“选错的人”；玩家应见到支持者与批评者的具体生活后果。

## Wade
玩家体验重点：
- 极端目标导向与伦理代价。
- 让玩家在多个任务中体验“效率的诱惑”。

## Yun Tianming
玩家体验重点：
- 个体情感、信息编码与文明交流。
- 童话/隐喻机制设计为解码玩法，不照搬原文长篇文本。

---

# Narrative rhythm per chapter

每章建议 60–120 分钟完整体验；大型章可拆成 2–3 节。

标准节奏：
1. Cold Open — 一个具体人物/日常问题
2. Free Explore — 场景探索、支线、物件
3. Inciting Anomaly — 异常/命令/发现
4. Investigation — 任务、科学或社会玩法
5. Character Chamber — 关键人物对话
6. Escalation — 风险升级
7. Crisis Gameplay — 冲突系统
8. Canon Anchor — 大事件
9. Aftermath — 余波中的普通生活
10. Archive Entry — 解锁档案与时代迁移

---

# Dialogue philosophy

每次关键对话至少承担两个功能：
- 人物塑造
- 信息
- 冲突
- 世界状态反馈
- 玩家价值选择
- 任务路由
- 科学教学

禁止连续 8 个以上纯信息节点而无交互变化。

对话选项类型：
- Ask：追问事实
- Empathize：情感回应
- Challenge：质疑假设
- Analyze：使用技能给出模型/证据
- Withhold：保留信息
- Commit：做出承诺
- Exit：结束

重要对话通过“态度 + 证据 + 历史关系”解锁不同节点，不做裸百分比好感条。

---

# Micro-life checklist

每个时代至少覆盖：
- 住房
- 食物
- 工作方式
- 娱乐
- 家庭联系
- 新闻/宣传媒介
- 医疗
- 交通
- 货币/资源感
- 人们对未来的流行看法

这些内容优先出现在：
- 可检查物件
- NPC 闲聊
- 商店/食堂
- 公共空间
- 通勤
- 休息区
而不是百科长文。


---


<!-- SOURCE: docs/02_TIMELINE_AND_CHAPTERS.md -->

# 02 — Timeline & Chapter Architecture

> 采用“纪元”而非强行写死所有公历年份，避免对细节年代的无谓错误。开发时应由叙事顾问对照合法授权文本建立最终 Canon Timeline Sheet。

# Act I — 火种 / Embers

## CH00 雪与火
Era: 1960s late
Playable: 林乔

场景：
- 城市短序：政治运动中的大学/研究系统
- 长途运输
- 偏远森林与工程营地
- 第一次看到巨大天线阵列

任务：
- 修复天气测量设备
- 把一封私人信送到不同收件人（微观选择）
- 在混乱的口述信息中辨别“技术事实”和“政治表态”

科学精神：
- 测量值与口号无关
- 观测的诚实性

Canon Anchor:
- 玩家不参与关键历史暴力行为，只以有限视角见证时代创伤。

## CH01 红岸
Playable: 林乔

主线：
- 设备异常
- 日常维护
- 与外围工作人员建立关系
- 发现项目远超“气象/通信”的表象

玩法：
- 射频校准小游戏
- 信号噪声分析
- 值班路线探索
- 受限区域潜行（低暴力）

微观：
- 冬季食物
- 配给与维修件
- 值夜班
- 人们如何谈论未来

Canon Anchor:
- 与太阳放大传播及宇宙回应有关的历史链条发生。
- 玩家只能接触痕迹和后果，不能替代叶文洁作出核心决定。

## CH02 回声
Playable: 林乔

主线：
- 系统出现无法解释的日志
- 玩家决定将“异常”报告给谁、保留多少副本
- 某些 NPC 因选择获得/失去信任

结尾：
- Chronicle Archive 第一份密封档案建立。

---

# Act II — 倒计时 / Countdown

## CH03 正常的一天
Era: Common Era, modern scientific crisis
Playable: 陈默

Cold Open:
- 通勤
- 实验室设备采购
- 与家人语音
- 同事对项目截止日期抱怨

随后：
- 科学家群体异常
- 王淼相关项目交集
- 史强进入

系统首次开放：
- Investigation Board
- Inventory
- Skills
- Quest Journal

## CH04 不存在的数字
主线：
- 倒计时异常
- 相机/视觉证据比对
- 实验日志交叉验证

科学玩法：
- 排除传感器故障
- 复现实验
- 建立可证伪假设

心理层：
- 玩家可选择“继续工作 / 求助 / 隐瞒”
- 不同选择改变疲劳、关系和线索获取，不改变 Canon Anchor。

## CH05 宇宙眨眼
场景：
- 观测设施
- 夜间城市
- 天文观测

演出：
- 视觉异常以环境级事件呈现，不仅是弹窗说明。

## CH06 三体世界 I：乱纪元
玩法从现实 RPG 切换为 stylized simulation。
- 生存资源
- 天体运动直觉
- 文明迭代
- NPC 模型角色
- 玩家逐渐理解游戏不是普通娱乐产品

## CH07 边界
- 科学组织
- ETO 相关线索
- 叶文洁的历史位置逐步清晰
- 经典人物对话密度上升

支线：
- 一个年轻研究员是否离开科研
- 一位家庭成员对“世界末日新闻”的反应
- 一名警员如何看待科学家的绝望

## CH08 古筝行动
不是射击关卡。

玩家角色作为数据/行动支持人员参与：
- 方案推演
- 时间窗选择
- 后勤准备
- 实时态势界面
- 事件发生后进入现场余波

重点：
- 让玩家感受计划的冷酷效率
- 同时看到具体人的代价

奖励不是“击杀数”，而是信息完整度、行动纪律、救援效率。

## CH09 锁死的天空
- 智子信息揭示
- 科学封锁成为新时代现实
- 人类进入危机纪元

结尾：
- 大城市公共屏幕、家庭餐桌、实验室、街边小店同时播放消息
- Act II 结束。

---

# Act III — 面壁 / The Wall

## CH10 面壁者
Playable: 徐然

玩家进入联合战略体系。
系统：
- Strategic Briefing
- Classified Intel
- Faction Trust
- Hibernation

玩法：
- 你无法知道哪些计划是真计划
- “信息权限”成为装备的一部分

## CH11 冬眠之后
玩家苏醒。

目标是让“未来”先成为生活，而不是科技展：
- 房间
- 医疗
- 食物
- 城市交通
- 身份认证
- 与跨时代后代/档案的关系

任务：
- 恢复身体
- 学习新社会规范
- 找回旧时代档案

## CH12 舰队
- 进入太空军/舰队环境
- 军事纪律
- 舰艇生活
- 张北海相关线索作为“事后才连成线”的设计

玩法：
- 舰船系统诊断
- 决策模拟
- 资源分配
- 小型 EVA

## CH13 水滴
大型危机章。

阶段：
1. 期待
2. 仪式化接触
3. 认知崩塌
4. 舰队灾难
5. 生存/救援
6. 事后失语

核心：不把灾难做成爽快射击。

玩家目标：
- 保持舰内系统
- 救援有限人数
- 导航
- 传递信息
- 在不可战胜的威胁下选择优先级

Canon Anchor:
- 战局结局固定。
- 玩家可以决定一个小队、家属通信、档案是否保存。

## CH14 黑暗森林
- 罗辑与威慑逻辑
- 玩家参与外围验证、态势维护、民众反应任务

科学/哲学玩法：
`Civilization Signal Model`
玩家通过有限信息推演：
- 生存需求
- 猜疑链
- 技术爆炸
- 可观测性
形成对宇宙社会学的直觉。

结尾：
- 威慑秩序建立。

---

# Act IV — 威慑 / Deterrence

## CH15 好时代
Playable: 安宁

先让玩家体验“看似稳定的日常”：
- 城市生活
- 文化
- 普通人对旧危机的疏离
- 年轻人把末日当历史课

随后威慑交接逼近。

## CH16 执剑
重点：
- 威慑不是一个按钮，而是一种政治、心理、技术系统。
- 玩家作为城市系统工程师/档案人员被卷入应急链条。

Canon Anchor:
- 交接后的重大转折按原作宏观结果推进。

玩家自由：
- 哪些城市系统优先
- 是否帮助特定 NPC 撤离
- 是否公开某些信息
- 对具体人的承诺

## CH17 引力
双线：
- 地球社会
- `Gravity / Blue Space` 相关远方线索

玩法：
- 通信延迟
- 决策无法撤回
- 四维空间段落使用空间规则改变的探索谜题，而非“更炫的地图”。

## CH18 童话密码
将“隐喻信息”改造成原创解码任务：
- 图像符号
- 叙事约束
- 物理可能性
- 交叉验证

不复制原作长篇童话文本；只表达其“通过叙事编码技术信息”的功能。

---

# Act V — 广播与掩体 / Broadcast & Bunker

## CH19 澳大利亚
重心是资源、秩序、伦理与普通人的具体生活。

系统：
- Group Morale
- Food / Medicine allocation
- Community Trust

玩家会遇到：
- 老人
- 儿童家庭
- 技术人员
- 曾支持不同政治选择的人

目标不是给出“正确答案”，而是逼玩家看见抽象政策如何落在具体生命上。

## CH20 掩体城
视觉：
- 巨型空间城市
- 封闭生态
- 旧地球记忆商品化

微观：
- 学校
- 修理店
- 住房
- 食物
- 代际冲突

## CH21 光速
- 曲率驱动研究
- 安全与自由的争论
- Wade / Cheng Xin 等角色形成高压伦理冲突

玩法：
- Research Tree 不是“点科技立即完成”
- 玩家要处理：
  - 人员
  - 保密
  - 风险
  - 试验
  - 政治阻力

---

# Act VI — 时间之外 / Beyond Time

## CH22 太阳系黄昏
灾难章。

核心演出：
- 先从一个普通人的一天开始。
- 再让不可逆的大尺度变化逐渐进入视野。
- 使用镜头、背景、空间压缩感和声音设计，而非堆文字。

玩家目标：
- 保存 Chronicle Archive
- 帮助有限 NPC
- 完成最后通信
- 选择带走哪些人类文化/私人记忆条目

宏观结局不变，微观保存内容进入终章。

## CH23 蓝星
- 远离太阳系后的世界
- 银河文明痕迹
- 时间尺度变化
- 文明不再以地球为中心

玩法更安静：
- 探索
- 地质/天文观测
- 遗迹
- 对话
- 生存维护

## CH24 小宇宙
最终章主要是“选择与归还”。

最终结算不做传统：
GOOD END / BAD END

而产生 **文明档案结语**：
- 你长期更相信什么？
- 你保护过哪些具体的人？
- 你保存了哪些知识？
- 你在不可控的大历史里采取什么姿态？
- 你是否愿意放弃私人安全以支持更大尺度的未来？

最后画面回看六个时代的普通物件，而不是只展示宇宙奇观。

---

# Side quest design matrix

每章至少：
- 1 Human quest：家庭/工作/朋友
- 1 Science quest：实验/观测/模型
- 1 Society quest：制度/资源/传播
- 1 Exploration secret：隐藏档案
- 1 Optional character scene：经典或原创 NPC

总支线不追求数量，追求“反馈到后世”。

例如 CH03 一个被玩家安慰并留在科研的人，CH11 可通过后代/档案知道其人生延续；这类跨时代回声是项目标志性内容。


---


<!-- SOURCE: docs/03_GAME_DESIGN_GDD.md -->

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


---


<!-- SOURCE: docs/04_SYSTEMS_AND_CONTENT_DESIGN.md -->

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


---


<!-- SOURCE: docs/05_UI_UX_AUDIO_VISUAL.md -->

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


---


<!-- SOURCE: docs/06_SDD_ENGINEERING_ARCHITECTURE.md -->

# 06 — SDD Engineering Architecture

本项目把 SDD 同时解释为：
1. **Specification-Driven Development**：先规范、后测试、再实现。
2. **Software Design Documents**：关键模块必须有可审阅设计文档。

# Architecture goals

- deterministic domain logic
- narrative-as-data
- renderer independence
- testability
- save stability
- incremental content delivery
- agent-friendly file boundaries

# Proposed repository layout

```text
/
  AGENTS.md
  START_HERE.md
  package.json
  vite.config.ts
  tsconfig.json
  src/
    domain/
      dialogue/
      quest/
      progression/
      inventory/
      relationship/
      challenge/
      save/
      events/
    application/
      commands/
      usecases/
      chapter/
    adapters/
      content/
      persistence/
      audio/
      input/
    game/
      scenes/
      entities/
      camera/
      interactables/
    ui/
      app/
      hud/
      dialogue/
      journal/
      inventory/
      skills/
      codex/
      timeline/
      settings/
    bootstrap/
  content/
    chapters/
    scenes/
    dialogue/
    quests/
    npcs/
    items/
    skills/
    medals/
    codex/
    audio/
    localization/
  schemas/
  tests/
    unit/
    integration/
    e2e/
    fixtures/
  tools/
    validate-content/
    build-content/
  docs/
  specs/
  adr/
```

# Runtime boundaries

## Domain
Zero framework dependency.

Example:
```ts
resolveSkillCheck(input): SkillCheckResult
advanceQuest(state, event): QuestState
applyDialogueEffects(state, effects): GameStatePatch
```

## Application
Coordinates:
- load scene
- start dialogue
- dispatch domain event
- checkpoint save
- switch chapter

## Adapter
Impure I/O:
- IndexedDB
- file import/export
- Howler
- content fetch
- browser APIs

## Phaser
Never owns canonical game state.
It renders a projection and emits player intents.

## React
Never mutates domain state directly.
UI sends command; application returns state/event.

# Event bus

Typed domain events.

Properties:
- serializable
- timestamp optional metadata
- unique event id where needed
- quest engine consumes events
- analytics adapter may consume only non-sensitive gameplay metrics if enabled

Do not use event bus as a replacement for clear function calls. Use it for cross-domain gameplay events.

# Save architecture

`SaveEnvelope`
- schemaVersion
- gameVersion
- contentVersion
- createdAt
- updatedAt
- checksum
- payload

Payload:
- chapter
- scene
- checkpoint
- domain states
- archive
- playtime

Migration:
`v1 -> v2 -> v3`, never `v1 -> latest` custom branches.

On load:
1. parse
2. verify checksum
3. validate envelope
4. sequential migrations
5. validate latest schema
6. hydrate domain
7. load scene
8. write migration backup if changed

# Content build

Source: YAML for authoring.
Build:
1. parse
2. schema validate
3. referential integrity
4. graph checks
5. localization key check
6. dialogue reachability
7. quest objective validation
8. output normalized JSON manifest

Dev server may hot reload content.

# Content graph checks

Mandatory:
- dangling dialogue next node
- unreachable mandatory node
- missing NPC
- missing scene
- duplicate ID
- quest with no resolvable completion
- item reference missing
- required localization missing
- chapter has no entry scene
- canon anchor order violation

# Error handling

Player-facing:
- content load retry
- save recovery
- audio failures degrade silently + log
- missing optional art uses placeholder
- missing mandatory scene blocks build, not runtime

# Observability

Dev only:
- narrative event console
- quest state inspector
- dialogue graph viewer
- save inspector
- current flags panel

Production:
- no debug panel
- sanitized error reporting if project later adds telemetry

# Security

- no eval
- no user-supplied executable scripts
- validate imported saves
- limit imported save file size
- escape text rendered in DOM
- CSP-friendly asset loading
- no secrets in client bundle


---


<!-- SOURCE: docs/07_TDD_AND_TEST_STRATEGY.md -->

# 07 — TDD & Test Strategy

# Principle

“测试”不是最后 QA。
核心规则必须先通过可执行测试定义。

Cycle:
`Spec → failing test → minimal implementation → pass → refactor → integration → E2E`

# Test pyramid

## Unit — largest
Targets:
- skill checks
- XP/levels
- inventory
- relationship changes
- quest transition
- dialogue conditions/effects
- content condition evaluator
- save migration
- codex unlock
- medal criteria

Characteristics:
- no browser
- no Phaser
- deterministic
- fast

## Integration
Targets:
- content loader + schema
- dialogue + quest event
- scene command + checkpoint save
- chapter transition
- audio cue adapter contract
- imported save validation

## E2E
Critical paths only:
- boot
- new game
- move
- interact
- dialogue choice
- quest completion
- skill upgrade
- equip tool
- save
- reload
- continue
- settings persistence
- chapter transition

# Mandatory test categories

### Narrative invariants
- Hard Canon flags cannot be unset by normal choice effects.
- Choice may affect Tier C state but not illegal Tier A outcome.
- Mandatory scene remains reachable.

### Save
- round trip
- old fixture migration
- corrupted checksum
- unknown extra fields
- missing required field
- interrupted save simulation
- autosave rotation

### Dialogue
- condition true/false
- no infinite auto-next loop
- no dangling node
- choice side effects exactly once
- skill check result routing
- localization key present

### Quest
- duplicate domain event idempotency
- out-of-order optional event
- resume from save
- no soft lock at required objective

### Browser
- resize
- tab hide/show
- audio context resume after user gesture
- keyboard focus
- pointer input
- reduced motion

# Visual regression

Use Playwright screenshots only for stable UI surfaces:
- dialogue
- journal
- inventory
- skill tree
- save screen

Do not screenshot-test whole animated gameplay every commit.

# Test naming

`Given_When_Then`

Example:
`givenEvidenceAndHighReason_whenAnalyzingSignal_thenReturnsClearSuccess`

# Acceptance criteria traceability

Feature Spec:
- AC-01...
- AC-02...

Tests include IDs:
```ts
describe("FS-DIALOGUE-001", () => {
  it("AC-03 ...", ...)
})
```

# Property-like tests

Useful areas:
- save migration preserves invariant IDs
- XP never decreases from award action
- inventory count never below zero
- dialogue runtime never executes unknown effect
- quest resolved state never returns to active without explicit reset API

# Content validation tests

Content is code-like and must fail CI on:
- duplicate IDs
- broken refs
- empty required dialogue
- illegal canon mutation
- unknown condition/effect
- missing localized key

# Quality command

Agent should implement:
```bash
npm run quality
```

Equivalent pipeline:
1. format check
2. lint
3. typecheck
4. unit
5. integration
6. content validate
7. build

E2E may be separate in early local loop but required at Work Order gates:
`npm run test:e2e`

# Bug workflow

Every confirmed bug:
1. add failing regression test
2. fix
3. retain test permanently unless architecture removed


---


<!-- SOURCE: docs/08_DATA_SCHEMAS_AND_CONTENT_DSL.md -->

# 08 — Data Schemas & Narrative DSL

目标：内容作者可以新增章节、对话和任务，而不进入游戏引擎代码。

# Chapter schema (conceptual)

```ts
Chapter {
  id
  actId
  order
  era
  titleKey
  playableCharacterId
  entrySceneId
  canonAnchors[]
  assetPack
  prerequisites[]
}
```

# Scene

```ts
Scene {
  id
  chapterId
  mapId
  spawnPoints[]
  npcs[]
  interactables[]
  ambienceCue
  musicCue
  onEnter[]
  exits[]
}
```

# NPC

```ts
Npc {
  id
  nameKey
  role
  era
  portraitSet
  defaultDialogueId?
  relationshipPolicy
  tags[]
}
```

# Dialogue

```ts
Dialogue {
  id
  entryNode
  nodes: Record<NodeId, DialogueNode>
}
```

# Declarative condition

```yaml
condition:
  kind: skill_at_least
  skillId: skill_science_signal_analysis
  value: 2
```

# Declarative effect

```yaml
effect:
  kind: quest_event
  event: signal.calibration_completed
```

# Canon protection

Effect processor must reject any content command matching protected namespace unless initiated by `CanonAnchorService`.

Protected examples:
- `canon.*`
- `era.transition.*`

Normal dialogue cannot:
```yaml
set_flag: canon.droplet.defeated
```

# Localization

Source content should use keys:
`dlg.ch04.observatory.chenmo.choice.ask_device`

Language files:
`content/localization/zh-CN/...`
`content/localization/en/...`

During prototype, text inline is allowed only inside `content_examples/`, never production runtime code.

# Schema versioning

Content manifest has:
- schemaVersion
- contentVersion
- generatedAt
- sourceHash

Save references stable IDs, not array indexes.


---


<!-- SOURCE: docs/09_PRODUCTION_PIPELINE.md -->

# 09 — Production & Content Pipeline

# Roles for a medium project

Even if CodingAgent writes most code, responsibilities must be conceptually separated:

- Product / Creative Director
- Narrative Designer
- Game Designer
- Tech Lead
- Gameplay Engineer
- UI Engineer
- Content Integrator
- Technical Artist
- 2D Artist / Animator
- Audio Designer / Composer
- QA
- Science Consultant
- Canon / Rights Reviewer

Agent may cover engineering/doc tasks; it should not silently replace rights, science, narrative sensitivity, voice casting, or final art review.

# Content pipeline

1. Chapter beat sheet
2. Canon review
3. Scene list
4. Quest design
5. Dialogue draft
6. Science interaction review
7. Content YAML
8. Automated validation
9. In-game staging
10. Playtest
11. Rewrite
12. Voice lock
13. Localization lock
14. Final QA

# Asset pipeline

Each asset has metadata:
- id
- owner/license
- source
- status: placeholder / draft / approved
- chapter pack
- dimensions / duration
- attribution requirement

No file enters Release Candidate without rights metadata.

# Narrative review checklist

- Does the chapter have a human-scale opening?
- Can a first-time player understand why this matters?
- Is there at least one playable scientific idea?
- Are classic characters acting as themselves rather than vending machines?
- Does the player have meaningful local agency?
- Is there a forced lore dump?
- Does a sensitive event need content warning?
- What persists into later eras?
- What is the final emotional image?

# Playtest questions

Do not ask only “好玩吗？”

Ask:
- What do you think just happened?
- Why did NPC X make that choice?
- What scientific idea did you infer?
- Which decision felt hardest?
- Did you know what to do next?
- Did any UI pull you out of the scene?
- Which ordinary-life detail made the era feel real?


---


<!-- SOURCE: docs/10_QA_PERFORMANCE_ACCESSIBILITY_RELEASE.md -->

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


---


<!-- SOURCE: docs/11_RISK_REGISTER.md -->

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


---


<!-- SOURCE: docs/12_IP_RIGHTS_AND_CONTENT_POLICY.md -->

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


---


<!-- SOURCE: docs/13_SCIENCE_PHILOSOPHY_MATRIX.md -->

# 13 — Science & Philosophy Gameplay Matrix

目标：每个重要思想必须有“可玩的入口、人物冲突、生活后果”，避免成为讲义。

| Theme | Playable Mechanic | Human-scale Scene | Player Tension |
|---|---|---|---|
| Scientific falsifiability | hypothesis elimination | lab colleague worries about career | admit uncertainty vs protect status |
| Measurement / observation | calibration & cross-check | overnight observatory shift | sleep/family vs verify anomaly |
| Three-body chaos | simulation parameters | player watches virtual civilization rebuild | predictability vs humility |
| Technology lock | research tree with hard ceiling | researcher considers leaving science | persist vs redirect life |
| Strategic deception | incomplete intel map | officer cannot tell family real mission | trust vs secrecy |
| Deterrence | credibility model | ordinary people normalize existential threat | moral restraint vs survival logic |
| Chain of suspicion | hidden-information simulation | two isolated teams interpret silence | trust vs preemption |
| Technological explosion | asymmetric tech timeline | old engineer feels obsolete after hibernation | continuity vs disruption |
| Escape ethics | limited transport capacity | family asks who gets a seat | equality vs capability |
| Resource ethics | allocation under scarcity | clinic / food line | aggregate survival vs specific person |
| Light-speed / black domain | research tradeoff model | scientist risks career and life | openness vs safety |
| Cosmic scale | map zoom / time dilation | personal keepsake outlives civilization | meaning despite insignificance |

# Science interaction review rubric

Each science encounter must answer:
1. What does the player manipulate?
2. What prediction can the player make before feedback?
3. What mistaken intuition is possible?
4. What changes after evidence arrives?
5. What does an NPC believe before/after?
6. How does this concept matter later in the story?

If the answer is only “read a Codex entry,” redesign it.

# Philosophy interaction rubric

Do not expose hidden morality math like:
`Utilitarian +10`.

Instead log choices into tags:
- transparency_preference
- preservation_scope
- risk_tolerance
- trust_prior
- individual_vs_collective
- reversible_vs_irreversible_action

Tags are used only for:
- epilogue reflection
- optional dialogue recognition
- medal criteria
- playtest analysis

They do not declare the player “good” or “bad.”

# Cross-era callbacks

A major philosophical choice should ideally have:
- immediate concrete effect
- one later echo
- one final archive interpretation

Example:
CH08 player prioritizes data integrity over rescue speed.
Immediate: better evidence, one NPC relationship worsens.
Later: archived decision is cited in a Crisis Era training case.
Final: archive epilogue notes a repeated pattern of prioritizing records over individuals.

The game never says whether this was correct.


---


<!-- SOURCE: docs/14_SCENE_AND_DIALOGUE_BLUEPRINTS.md -->

# 14 — Scene & Dialogue Blueprints

# Scene Card Template

## Identity
- Scene ID
- Chapter
- Location
- Time / era
- Playable character
- Entry conditions
- Exit conditions

## Emotional purpose
One sentence.

## Knowledge delta
What the player should understand after this scene that they did not before.

## Human detail
At least one ordinary-life detail.

## Interactions
- NPC
- object
- optional
- hidden
- system challenge

## State writes
Explicit flags/events only.

## Audio
- ambience
- music state
- voice priority
- silence moment

## Accessibility
- flashes?
- timed input?
- audio information?
- camera motion?

## Save checkpoint
Before / after / none.

# Major Dialogue Blueprint

## Dramatic question
What is unresolved between the speakers?

## NPC wants
Concrete present-tense objective.

## Player can want
At least 2 plausible objectives.

## Information layers
- free
- asked
- evidence-gated
- relationship-gated
- skill-gated

## Branch policy
Branches should usually reconverge at a story beat but leave state differences.

## Exit consequences
- relationship
- quest
- evidence
- promise/debt
- later callback

# Example: Observatory conversation

Dramatic question:
Is the player willing to admit the anomaly is real before having an explanation?

NPC wants:
A defensible observation record.

Player approaches:
- insist on another control
- ask for independent verification
- hide the anomaly
- disclose the countdown context

System:
Reason + Experimental Design can unlock a better test plan.
Empathy can reveal the NPC is afraid of being associated with “unstable” colleagues.
No option can simply make the cosmic anomaly disappear.

# Canon Character Scene Rule

Before writing a scene with a classic character, author must state:
- What does this character uniquely contribute?
- Why can an original NPC not fulfill the same function?
- Which Canon Anchor constrains the scene?
- What must the player never be allowed to decide on this character's behalf?


---


<!-- SOURCE: docs/15_BALANCE_AND_PROGRESSION_GUIDE.md -->

# 15 — Balance & Progression Guide

# Level curve

Per era playable character: 1–20.

Recommended pacing:
- start: 1
- end of introductory chapter: 3–4
- act midpoint: 8–11
- act climax: 14–17
- optional mastery: 20

Level is a pacing tool, not a grind target.

# XP source weights

Guideline:
- main quest milestone: high
- side quest: medium
- scientific insight: medium
- important discovery: low/medium
- relationship breakthrough: low
- repetitive interaction: zero

No random encounter grinding.

# Skill point cadence

1 skill point roughly every 1–2 levels, plus rare quest rewards.
No tree should be fully maxed in one normal playthrough.

Player should specialize enough to see distinct dialogue solutions while still finishing main story.

# Check thresholds

Do not store invisible arbitrary difficulty all over content.

Difficulty tiers:
- Routine
- Trained
- Expert
- Exceptional

Map tier to a central configuration per chapter/era.

Costly success band should be broad enough that under-specialized players still progress.

# Inventory philosophy

Inventory should remain small and legible:
- 8–16 meaningful carried items typical
- quest evidence stored in Investigation Board, not backpack clutter
- no trash loot
- consumables limited to crisis scenes

# Relationship tuning

Normal scene changes:
- trust/respect ±1 to ±5
Major promise/betrayal:
- ±8 to ±20

Avoid one conversation jumping from stranger to soulmate.

# Crisis balance

Crisis chapters are not about “winning” the macro event.
Metrics:
- people assisted
- system integrity
- archive integrity
- personal injury/fatigue
- information completeness

Use multi-objective pressure so no perfect solution is obvious.

# Difficulty modes

Story:
- stronger hints
- no forced timed dialogue
- forgiving crisis resource rate
- skill checks more often produce costly success

Standard:
- intended experience

Analyst:
- fewer hints
- tighter resource/information pressure
- scientific tasks require one extra validation step

No extra enemy HP sponge.


---


<!-- SOURCE: docs/16_TECHNICAL_CONTRACTS.md -->

# 16 — Technical Contracts

These are design-level interfaces. Agent may refine types but must preserve responsibilities.

# Game command

```ts
type GameCommand =
  | { type: "interaction/use"; targetId: string }
  | { type: "dialogue/select"; dialogueId: string; choiceId: string }
  | { type: "inventory/equip"; itemId: string }
  | { type: "skill/learn"; skillId: string }
  | { type: "save/request"; slot: SaveSlot }
  | { type: "scene/exit"; exitId: string };
```

# Domain event

```ts
interface DomainEvent<T extends string = string, P = unknown> {
  id: string;
  type: T;
  payload: P;
  sequence: number;
}
```

Sequence is logical ordering, not wall-clock authority.

# Game snapshot

UI and renderer consume a read-only projection:

```ts
interface GameSnapshot {
  chapterId: string;
  sceneId: string;
  player: PlayerView;
  questJournal: QuestJournalView;
  dialogue?: DialogueView;
  inventory: InventoryView;
  relationships: RelationshipView[];
  world: WorldView;
}
```

Never expose mutable domain objects directly.

# Content repository

```ts
interface ContentRepository {
  chapter(id: string): ChapterDefinition;
  scene(id: string): SceneDefinition;
  dialogue(id: string): DialogueDefinition;
  quest(id: string): QuestDefinition;
  npc(id: string): NpcDefinition;
}
```

# Persistence port

```ts
interface SaveRepository {
  list(): Promise<SaveSummary[]>;
  read(slot: SaveSlot): Promise<SaveEnvelope | null>;
  write(slot: SaveSlot, save: SaveEnvelope): Promise<void>;
  remove(slot: SaveSlot): Promise<void>;
}
```

# Audio port

```ts
interface AudioService {
  setBusVolume(bus: AudioBus, value: number): void;
  playCue(cueId: string): Promise<void>;
  stopCue(cueId: string): void;
  transitionMusic(stateId: string): Promise<void>;
  setAmbience(stateId: string): Promise<void>;
}
```

# Canon anchor service

Only this application service may mutate protected macro state.

```ts
interface CanonAnchorService {
  canTrigger(anchorId: string, snapshot: GameSnapshot): boolean;
  trigger(anchorId: string): Promise<CanonAnchorResult>;
}
```

Dialogue/quest content can request:
`anchor.requested`
but cannot write `canon.*` directly.

# Time

Avoid system time in deterministic game logic.
Use injected `GameClock` for playtime/cooldown where required.

# Randomness

If any random outcome is used:
- injected RNG
- seed recorded in save/checkpoint
- tests use fixed seed

Narrative-critical facts must not depend on unrepeatable randomness.


---


<!-- SOURCE: execution/MASTER_EXECUTION_ORDER.md -->

# MASTER EXECUTION ORDER

CodingAgent: this is the authoritative work sequence.

Do not attempt to “build the whole game in one task.”

# Gate 0 — Repository contract

Execute:
- WO-000 Bootstrap
- WO-001 Quality pipeline
- WO-002 Domain event kernel

Exit:
- empty game shell boots
- tests/build/typecheck/lint pass
- architecture directories exist
- ADRs written

# Gate 1 — Narrative vertical slice foundation

Execute:
- WO-010 Content schema
- WO-011 Dialogue engine
- WO-012 Quest engine
- WO-013 Save system
- WO-014 Exploration interaction

Exit:
- data-driven scene
- interactable NPC
- branching dialogue
- quest progression
- save/reload restores exact state

# Gate 2 — RPG progression

Execute:
- WO-020 Character/XP
- WO-021 Skills/checks
- WO-022 Inventory/equipment
- WO-023 Relationships/medals/codex

Exit:
- player can earn XP, level, learn skill, equip item
- skill and evidence influence dialogue/challenge
- relationship consequence persists

# Gate 3 — Presentation

Execute:
- WO-030 React HUD/menus
- WO-031 Audio
- WO-032 Cinematics
- WO-033 Accessibility/settings

Exit:
- vertical slice feels like a game, not debug harness

# Gate 4 — Vertical Slice: CH03–CH06 excerpt

Execute:
- WO-040 Modern city/lab scene pack
- WO-041 Countdown investigation
- WO-042 Observatory scene
- WO-043 Three-Body simulation scene
- WO-044 Vertical-slice E2E + polish

Exit:
- 30–45 minute coherent playable slice
- new player comprehension playtest ready

# Gate 5 — Campaign production

One act at a time:
- Act I Embers
- Complete Act II
- Act III
- Act IV
- Act V
- Act VI

For each Act:
1. Narrative beat lock
2. Content specs
3. System gaps
4. Content implementation
5. Act E2E
6. Save migration fixture
7. Playtest
8. Rewrite
9. Gate review

# Gate 6 — RC

- rights review
- complete QA
- browser matrix
- performance
- accessibility
- localization
- save backward compatibility
- production asset manifest
- release checklist

# Agent decision rule

If current task reveals architecture debt that blocks later work:
1. open ADR
2. add minimal refactor Work Order
3. keep current acceptance criteria visible
4. do not perform unrelated rewrite

# No silent scope change

Any proposed change to:
- camera model
- engine
- content language
- save format
- protagonist structure
- canon model
requires ADR + Design Impact section.


---


<!-- SOURCE: execution/DEFINITION_OF_READY_DONE.md -->

# Definition of Ready / Definition of Done

# Feature Definition of Ready

A feature may enter implementation only when:
- player problem/value is stated
- scope in/out exists
- UX flow exists
- domain state is defined
- save impact assessed
- acceptance criteria numbered
- test approach mapped
- narrative/canon impact assessed if relevant
- dependencies identified

If any are missing, Agent should edit Spec first.

# Content Scene Definition of Ready

- Scene Card complete
- entry/exit known
- NPC list known
- required assets can be placeholders
- state writes listed
- mandatory quest path known
- save checkpoint decision made

# Engineering Definition of Done

- acceptance criteria pass
- tests added at proper layers
- strict types
- no architecture boundary violation
- docs updated
- content validates
- save migration included if needed
- quality passes
- E2E added if user-critical flow changed

# Narrative Definition of Done

- first-time comprehension check
- classic character guardrails respected
- human detail present
- no excessive lore dump
- scientific concept is interactive when important
- downstream callback IDs recorded
- spoiler tier correct


---


<!-- SOURCE: execution/PLAYTEST_PLAN.md -->

# Playtest Plan

# P0 — Internal logic
Audience: dev/design team
Goal: soft locks, confusing objectives, bad pacing.

# P1 — First-time sci-fi player
Must not have read the novels.
Questions:
- Who do you think the important factions/people are?
- What caused your current problem?
- What scientific idea did you just use?
- What do you think will happen next?
- Which choice mattered to a specific person?

Pass condition:
Player can summarize chapter causality without external explanation.

# P2 — Novel-familiar player
Questions:
- Which classic beat felt recognizably authentic?
- Which scene felt like exposition cosplay?
- Did original player character steal a canonical character's role?
- Did any invented dialogue contradict characterization?

# P3 — RPG systems player
Questions:
- Did skills change play?
- Did equipment matter?
- Did quest journal help?
- Did failure create content or just annoyance?
- Did you feel agency despite fixed macro events?

# P4 — Accessibility
Test:
- keyboard only
- large text
- muted audio
- reduced motion

# Vertical slice observation sheet

Record:
- time to first movement
- time to first meaningful choice
- first objective confusion
- first voluntary Codex open
- dialogue skip behavior
- save use
- science challenge attempts
- emotional high point
- dropout point

Do not optimize purely for speed. A slow quiet scene can be successful if players remain engaged and understand its purpose.
