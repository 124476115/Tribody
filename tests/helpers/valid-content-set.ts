/**
 * The canonical valid content set for FS-CONTENT-001 tests.
 *
 * Mirrors the AGENTS ID conventions and the docs/08 / docs/04 / docs/14 content
 * DSL. Every reference (dialogue next, npc, cue, item, skill, codex, scene,
 * scene exits, chapter entry scene) resolves within this set. It must produce a
 * manifest with zero error-level issues.
 */

import type { ContentSource, LocaleSource } from '../../tools/validate-content/pipeline';
import { locale, src, yaml } from './content-fixtures';

export const VALID_LOCALE_SOURCES: LocaleSource[] = [
  locale(
    'zh-CN',
    'content/localization/zh-CN/ch04.yaml',
    yaml`
chapter.ch04.title: "倒计时"
scene.ch04.lab.name: "实验室 · 清晨"
scene.ch04.hall.name: "走廊"
scene.ch04.ex_hall: "去走廊"
npc.lab_colleague.name: "实验室同事"
dlg.ch04.camera.n01.text: "你对相机结果的怀疑来源是?"
dlg.ch04.camera.n01.c_ask.text: "不是相机。我想把两组原始数据再做一次比对。"
dlg.ch04.camera.n01.c_hide.text: "可能只是我太累了。先别声张。"
quest.ch04.explain.title: "把异常变成问题"
quest.ch04.explain.start: "先确认这不是最普通的设备故障。"
quest.ch04.explain.complete: "问题变得更清楚了。"
item.document_log.name: "观测日志"
item.document_log.description: "两组原始数据的打印件。"
item.tool.relay_scanner.name: "中继扫描仪"
item.tool.relay_scanner.description: "手持式信号中继扫描装置。"
item.consumable.notch.name: "能量槽片"
item.consumable.notch.description: "廉价的一次性供能单元。"
skill.scientist.experimental_design.name: "实验设计"
skill.scientist.experimental_design.description: "设计对照实验以排除无关变量。"
codex.science.falsifiability.title: "可证伪性"
codex.science.falsifiability.short: "能证明它错，才算得上一句解释。"
codex.science.falsifiability.expanded: "任何假说都必须能够被观察结果推翻。"
`
  ),
  locale(
    'zh-CN',
    'content/localization/zh-CN/skills.yaml',
    yaml`
skill.investigator.pattern_recognition.name: "模式识别"
skill.investigator.pattern_recognition.description: "从噪声与规律之间划出边界。"
skill.investigator.interview.name: "访谈"
skill.investigator.interview.description: "从口证与沉默里提取可检验的事实。"
skill.investigator.surveillance_awareness.name: "监查警觉"
skill.investigator.surveillance_awareness.description: "察觉注视的存在与方向。"
skill.investigator.evidence_reconstruction.name: "证据重构"
skill.investigator.evidence_reconstruction.description: "把碎片重新放回时间与空间里。"
skill.scientist.signal_analysis.name: "信号分析"
skill.scientist.signal_analysis.description: "从周期性数据里判断它是否来自某种意图。"
skill.scientist.model_testing.name: "模型检验"
skill.scientist.model_testing.description: "让假说承受证据的否定。"
skill.scientist.cosmology_literacy.name: "宇宙学素养"
skill.scientist.cosmology_literacy.description: "理解尺度、光速与数据的可观察边界。"
skill.operator.repair.name: "维修"
skill.operator.repair.description: "让失效的设备重新处于受控状态。"
skill.operator.emergency_response.name: "应急响应"
skill.operator.emergency_response.description: "在既定程序失效时守住第一步行动。"
skill.operator.eva.name: "舱外作业"
skill.operator.eva.description: "在真空与温度边界内完成操作。"
skill.operator.navigation.name: "导航"
skill.operator.navigation.description: "在失去参照时保持坐标。"
skill.strategist.risk_analysis.name: "风险分析"
skill.strategist.risk_analysis.description: "在信息不全时排序代价与概率。"
skill.strategist.resource_command.name: "资源调度"
skill.strategist.resource_command.description: "把有限供给分配到必须到达的位置。"
skill.strategist.deception_detection.name: "欺骗侦测"
skill.strategist.deception_detection.description: "识别信息被压缩、删改或编造的痕迹。"
skill.strategist.long_horizon.name: "长视界"
skill.strategist.long_horizon.description: "把当下的选择放到几十年后的尺度检验。"
skill.humanist.de_escalation.name: "降级沟通"
skill.humanist.de_escalation.description: "把人从对抗情境里带回可以对话的位置。"
skill.humanist.empathy.name: "共情"
skill.humanist.empathy.description: "理解他人行为背后的约束。"
skill.humanist.cultural_memory.name: "文化记忆"
skill.humanist.cultural_memory.description: "保存世代记忆与仪式的连续性。"
skill.humanist.group_cohesion.name: "群体凝聚"
skill.humanist.group_cohesion.description: "让一个共同行动的群体保持信任。"
`
  ),
];

export const CH_CHAPTER: ContentSource = src(
  'chapter',
  'content/chapters/ch_common_04_countdown.yaml',
  yaml`
id: ch_common_04_countdown
actId: act_02_countdown
order: 4
era: common
titleKey: chapter.ch04.title
playableCharacterId: pc_chen_mo
entrySceneId: sc_ch04_lab_morning
assetPack: pack_ch04
prerequisites:
  - flag.ch03.intro.completed
canonAnchors:
  - anchor.modern_science_crisis
`
);

export const SC_LAB_MORNING: ContentSource = src(
  'scene',
  'content/scenes/sc_ch04_lab_morning.yaml',
  yaml`
id: sc_ch04_lab_morning
chapterId: ch_common_04_countdown
titleKey: scene.ch04.lab.name
mapId: map_ch04_lab
spawnPoints:
  - sp_entrance
npcs:
  - npcId: npc_lab_colleague
interactables:
  - id: it_camera
ambienceCueId: cue_ambience_observatory
musicCueId: cue_music_observatory
onEnter: []
exits:
  - id: ex_hall
    labelKey: scene.ch04.ex_hall
    toSceneId: sc_ch04_hall
`
);

export const SC_HALL: ContentSource = src(
  'scene',
  'content/scenes/sc_ch04_hall.yaml',
  yaml`
id: sc_ch04_hall
chapterId: ch_common_04_countdown
titleKey: scene.ch04.hall.name
mapId: map_ch04_hall
spawnPoints:
  - sp_center
npcs: []
interactables: []
onEnter: []
exits: []
`
);

export const NPC_COLLEAGUE: ContentSource = src(
  'npc',
  'content/npcs/npc_lab_colleague.yaml',
  yaml`
id: npc_lab_colleague
nameKey: npc.lab_colleague.name
role: research_assistant
era: common
portraitSet: portrait_colleague_1
defaultDialogueId: dlg_ch04_camera_anomaly
relationshipPolicy: weighted
tags:
  - lab
`
);

export const DLG_ANOMALY: ContentSource = src(
  'dialogue',
  'content/dialogue/dlg_ch04_camera_anomaly.yaml',
  yaml`
id: dlg_ch04_camera_anomaly
entryNode: n01
nodes:
  n01:
    speaker: npc_lab_colleague
    portraitState: neutral
    textKey: dlg.ch04.camera.n01.text
    tags:
      - ch04
    onEnterEffects: []
    choices:
      - id: c_ask
        textKey: dlg.ch04.camera.n01.c_ask.text
        conditions:
          - kind: skill_at_least
            skillId: skill_scientist_experimental_design
            value: 1
        effects:
          - kind: quest_event
            event: ch04.raw_data_compare_requested
        next: n02
      - id: c_hide
        textKey: dlg.ch04.camera.n01.c_hide.text
        conditions: []
        effects:
          - kind: adjust_relationship
            npcId: npc_lab_colleague
            dimension: trust
            amount: -2
        next: end
  n02:
    speaker: npc_lab_colleague
    portraitState: neutral
    textKey: dlg.ch04.camera.n01.text
    tags:
      - ch04
    onEnterEffects: []
    choices: []
    autoNext: end
`
);

export const Q_EXPLAIN: ContentSource = src(
  'quest',
  'content/quests/q_ch04_explain_countdown.yaml',
  yaml`
id: q_ch04_explain_countdown
chapterId: ch_common_04_countdown
titleKey: quest.ch04.explain.title
initialState: available
objectives:
  - id: obj_compare
    type: analyze
    required: true
    listensFor:
      - ch04.raw_data_compare_requested
  - id: obj_talk
    type: talk
    required: true
    npcId: npc_lab_colleague
resolution:
  onAllRequiredComplete: resolved_success
journal:
  startKey: quest.ch04.explain.start
  completeKey: quest.ch04.explain.complete
`
);

export const ITEM_LOG: ContentSource = src(
  'item',
  'content/items/item_document_log.yaml',
  yaml`
id: item_document_log
category: document
nameKey: item.document_log.name
descriptionKey: item.document_log.description
`
);

export const ITEM_RELAY: ContentSource = src(
  'item',
  'content/items/item_tool_relay_scanner.yaml',
  yaml`
id: item_tool_relay_scanner
category: tool
nameKey: item.tool.relay_scanner.name
descriptionKey: item.tool.relay_scanner.description
slot: tool
stackable: false
questProtected: false
`
);

export const ITEM_NOTCH: ContentSource = src(
  'item',
  'content/items/item_consumable_notch.yaml',
  yaml`
id: item_consumable_notch
category: consumable
nameKey: item.consumable.notch.name
descriptionKey: item.consumable.notch.description
stackable: true
`
);

export const SKILL_DESIGN: ContentSource = src(
  'skill',
  'content/skills/skill_scientist_experimental_design.yaml',
  yaml`
id: skill_scientist_experimental_design
tree: scientist
nameKey: skill.scientist.experimental_design.name
descriptionKey: skill.scientist.experimental_design.description
`
);

// The other 19 canonical FS-SKILL-001 skills (the WO-021 content step).
const SKILL_SOURCE = (skillId: string, tree: string): ContentSource =>
  src(
    'skill',
    `content/skills/${skillId}.yaml`,
    yaml`
id: ${skillId}
tree: ${tree}
nameKey: skill.${tree}.${skillId.replace(`skill_${tree}_`, '')}.name
descriptionKey: skill.${tree}.${skillId.replace(`skill_${tree}_`, '')}.description
`
  );

export const SKILL_EXPERIMENTAL_DESIGN = SKILL_DESIGN;
export const SKILL_PATTERN_RECOGNITION = SKILL_SOURCE(
  'skill_investigator_pattern_recognition',
  'investigator'
);
export const SKILL_INTERVIEW = SKILL_SOURCE('skill_investigator_interview', 'investigator');
export const SKILL_SURVEILLANCE_AWARENESS = SKILL_SOURCE(
  'skill_investigator_surveillance_awareness',
  'investigator'
);
export const SKILL_EVIDENCE_RECONSTRUCTION = SKILL_SOURCE(
  'skill_investigator_evidence_reconstruction',
  'investigator'
);
export const SKILL_SIGNAL_ANALYSIS = SKILL_SOURCE('skill_scientist_signal_analysis', 'scientist');
export const SKILL_MODEL_TESTING = SKILL_SOURCE('skill_scientist_model_testing', 'scientist');
export const SKILL_COSMOLOGY_LITERACY = SKILL_SOURCE(
  'skill_scientist_cosmology_literacy',
  'scientist'
);
export const SKILL_REPAIR = SKILL_SOURCE('skill_operator_repair', 'operator');
export const SKILL_EMERGENCY_RESPONSE = SKILL_SOURCE(
  'skill_operator_emergency_response',
  'operator'
);
export const SKILL_EVA = SKILL_SOURCE('skill_operator_eva', 'operator');
export const SKILL_NAVIGATION = SKILL_SOURCE('skill_operator_navigation', 'operator');
export const SKILL_RISK_ANALYSIS = SKILL_SOURCE('skill_strategist_risk_analysis', 'strategist');
export const SKILL_RESOURCE_COMMAND = SKILL_SOURCE(
  'skill_strategist_resource_command',
  'strategist'
);
export const SKILL_DECEPTION_DETECTION = SKILL_SOURCE(
  'skill_strategist_deception_detection',
  'strategist'
);
export const SKILL_LONG_HORIZON = SKILL_SOURCE('skill_strategist_long_horizon', 'strategist');
export const SKILL_DE_ESCALATION = SKILL_SOURCE('skill_humanist_de_escalation', 'humanist');
export const SKILL_EMPATHY = SKILL_SOURCE('skill_humanist_empathy', 'humanist');
export const SKILL_CULTURAL_MEMORY = SKILL_SOURCE('skill_humanist_cultural_memory', 'humanist');
export const SKILL_GROUP_COHESION = SKILL_SOURCE('skill_humanist_group_cohesion', 'humanist');

export const SKILL_SOURCES: ContentSource[] = [
  SKILL_DESIGN,
  SKILL_PATTERN_RECOGNITION,
  SKILL_INTERVIEW,
  SKILL_SURVEILLANCE_AWARENESS,
  SKILL_EVIDENCE_RECONSTRUCTION,
  SKILL_SIGNAL_ANALYSIS,
  SKILL_MODEL_TESTING,
  SKILL_COSMOLOGY_LITERACY,
  SKILL_REPAIR,
  SKILL_EMERGENCY_RESPONSE,
  SKILL_EVA,
  SKILL_NAVIGATION,
  SKILL_RISK_ANALYSIS,
  SKILL_RESOURCE_COMMAND,
  SKILL_DECEPTION_DETECTION,
  SKILL_LONG_HORIZON,
  SKILL_DE_ESCALATION,
  SKILL_EMPATHY,
  SKILL_CULTURAL_MEMORY,
  SKILL_GROUP_COHESION,
];

export const CODEX_FALSIFIABILITY: ContentSource = src(
  'codex',
  'content/codex/codex_science_falsifiability.yaml',
  yaml`
id: codex_science_falsifiability
category: Science
spoilerTier: 0
unlockedAt: ch04
titleKey: codex.science.falsifiability.title
shortKey: codex.science.falsifiability.short
expandedKey: codex.science.falsifiability.expanded
relatedIds: []
`
);

export const CUE_AMBIENCE: ContentSource = src(
  'audioCue',
  'content/audio/cue_ambience_observatory.yaml',
  yaml`
id: cue_ambience_observatory
category: ambience
loop: true
volume: 0.4
`
);

export const CUE_MUSIC: ContentSource = src(
  'audioCue',
  'content/audio/cue_music_observatory.yaml',
  yaml`
id: cue_music_observatory
category: music
loop: false
volume: 0.6
`
);

/** Canonical valid set. Order is intentionally NOT alphabetized internally to
 * exercise order preservation in the manifest unit tests. */
export const VALID_SOURCES: ContentSource[] = [
  CH_CHAPTER,
  SC_LAB_MORNING,
  SC_HALL,
  NPC_COLLEAGUE,
  DLG_ANOMALY,
  Q_EXPLAIN,
  ITEM_LOG,
  ITEM_RELAY,
  ITEM_NOTCH,
  ...SKILL_SOURCES,
  CODEX_FALSIFIABILITY,
  CUE_AMBIENCE,
  CUE_MUSIC,
];

export const TITLE_KEY = 'chapter.ch04.title';
export const NEXT_BROKEN = 'n99';
export const NPC_ID = 'npc_lab_colleague';
export const DIALOGUE_ID = 'dlg_ch04_camera_anomaly';
export const QUEST_ID = 'q_ch04_explain_countdown';
export const CHAPTER_ID = 'ch_common_04_countdown';
