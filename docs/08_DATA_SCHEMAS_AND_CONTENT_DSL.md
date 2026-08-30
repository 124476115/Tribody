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
