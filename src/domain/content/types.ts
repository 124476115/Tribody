/**
 * Content Domain — core types
 *
 * Pure TypeScript value contracts for the normalized content pipeline. No Phaser,
 * React, Zod, or Node.js built-ins may appear in this directory (AC-14). These
 * types are the stable, save-facing boundary produced by the build-time content
 * validator (WO-010) and consumed at runtime by later work orders.
 *
 * Semantically-ordered arrays (choices, objectives, exits, spawn points, npc
 * lists, conditions, effects, prerequisites, canon anchors, tags, related ids)
 * keep the author's order; only lookup maps are key-sorted for byte-stable
 * output.
 */

import type { EquipmentSlot } from '../inventory';

export type ContentCategory =
  'chapter' | 'scene' | 'npc' | 'dialogue' | 'quest' | 'item' | 'skill' | 'codex' | 'audioCue';

export type IssueCategory =
  | 'parse'
  | 'schema'
  | 'id'
  | 'duplicate-id'
  | 'missing-ref'
  | 'graph'
  | 'contract'
  | 'canon'
  | 'localization'
  | 'manifest'
  | 'unsupported-extension';

export type IssueSeverity = 'error' | 'warning';

export interface ContentIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  file: string;
  contentId?: string;
  path?: string;
  message: string;
}

export interface ManifestMeta {
  schemaVersion: '1.0.0';
  contentVersion: string;
  sourceHash: string;
}

export interface ChapterManifest {
  id: string;
  actId: string;
  order: number;
  era: string;
  titleKey: string;
  playableCharacterId: string;
  entrySceneId: string;
  assetPack: string;
  prerequisites: string[];
  canonAnchors: string[];
}

export interface NpcRef {
  npcId: string;
}

export interface InteractableRef {
  id: string;
}

export interface ExitRef {
  id: string;
  labelKey: string;
  toSceneId: string;
}

export interface SceneManifest {
  id: string;
  chapterId: string;
  titleKey: string;
  mapId: string;
  spawnPoints: string[];
  npcs: NpcRef[];
  interactables: InteractableRef[];
  ambienceCueId?: string | undefined;
  musicCueId?: string | undefined;
  onEnter: Effect[];
  exits: ExitRef[];
}

export interface NpcManifest {
  id: string;
  nameKey: string;
  role?: string | undefined;
  era?: string | undefined;
  portraitSet?: string | undefined;
  defaultDialogueId?: string | undefined;
  relationshipPolicy?: string | undefined;
  tags: string[];
}

export interface SkillCheck {
  skillId: string;
  threshold: number;
}

export type Condition =
  | { kind: 'flag'; flag: string }
  | { kind: 'quest_state'; questId: string; state: string }
  | { kind: 'relationship_at_least'; npcId: string; dimension: string; min: number }
  | { kind: 'skill_at_least'; skillId: string; value: number }
  | { kind: 'has_item'; itemId: string; count?: number | undefined }
  | { kind: 'has_codex'; codexId: string }
  | { kind: 'chapter_state'; chapterId: string };

export type Effect =
  | { kind: 'set_flag'; flag: string }
  | { kind: 'adjust_relationship'; npcId: string; dimension: string; amount: number }
  | { kind: 'add_item'; itemId: string; count?: number | undefined }
  | { kind: 'remove_item'; itemId: string; count?: number | undefined }
  | { kind: 'add_codex'; codexId: string }
  | { kind: 'quest_event'; event: string }
  | { kind: 'award_xp'; xp: number }
  | { kind: 'play_audio'; cueId: string }
  | { kind: 'emit_narrative_event'; event: string };

export interface DialogueChoiceManifest {
  id: string;
  textKey: string;
  conditions: Condition[];
  effects: Effect[];
  skillCheck?: SkillCheck | undefined;
  next: string;
}

export interface DialogueNodeManifest {
  speaker: string;
  portraitState?: string | undefined;
  textKey: string;
  voiceCueId?: string | undefined;
  tags: string[];
  onEnterEffects: Effect[];
  choices: DialogueChoiceManifest[];
  autoNext?: string | undefined;
}

export interface DialogueManifest {
  id: string;
  entryNode: string;
  nodes: Record<string, DialogueNodeManifest>;
}

export type QuestInitialState = 'locked' | 'available' | 'active';

export type QuestObjectiveKind =
  | 'collect_evidence'
  | 'analyze'
  | 'talk'
  | 'go_to'
  | 'interact'
  | 'choose'
  | 'survive'
  | 'repair'
  | 'escort'
  | 'wait_for_event';

export interface QuestObjectiveManifest {
  id: string;
  type: QuestObjectiveKind;
  required: boolean;
  npcId?: string | undefined;
  sceneId?: string | undefined;
  dialogueId?: string | undefined;
  itemIds?: string[] | undefined;
  skillIds?: string[] | undefined;
  codexIds?: string[] | undefined;
  evidenceIds?: string[] | undefined;
  listensFor?: string[] | undefined;
}

export interface QuestResolution {
  onAllRequiredComplete: 'resolved_success' | 'resolved_costly' | 'resolved_failure' | 'archived';
}

export interface QuestJournal {
  startKey: string;
  completeKey: string;
}

export interface QuestManifest {
  id: string;
  chapterId: string;
  titleKey: string;
  initialState: QuestInitialState;
  objectives: QuestObjectiveManifest[];
  resolution: QuestResolution;
  journal: QuestJournal;
}

export interface ItemManifest {
  id: string;
  category: string;
  nameKey: string;
  descriptionKey: string;
  /** Authored equipment slot; absent items are not equippable. */
  slot?: EquipmentSlot | undefined;
  /** Whether multiple units may stack on one line. Default false. */
  stackable: boolean;
  /** Quest-critical; ordinary removeItem refuses while true. Default false. */
  questProtected: boolean;
}

export interface SkillManifest {
  id: string;
  tree: string;
  nameKey: string;
  descriptionKey: string;
}

export interface CodexManifest {
  id: string;
  category: string;
  spoilerTier: number;
  unlockedAt: string;
  titleKey: string;
  shortKey: string;
  expandedKey: string;
  relatedIds: string[];
}

export interface AudioCueManifest {
  id: string;
  category: 'music' | 'ambience' | 'voice' | 'sfx' | 'ui';
  loop: boolean;
  volume: number;
}

export interface ContentManifest {
  meta: ManifestMeta;
  chapters: Record<string, ChapterManifest>;
  scenes: Record<string, SceneManifest>;
  npcs: Record<string, NpcManifest>;
  dialogues: Record<string, DialogueManifest>;
  quests: Record<string, QuestManifest>;
  items: Record<string, ItemManifest>;
  skills: Record<string, SkillManifest>;
  codex: Record<string, CodexManifest>;
  audioCues: Record<string, AudioCueManifest>;
  localization: Record<string, Record<string, string>>;
}
