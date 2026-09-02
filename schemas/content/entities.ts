/**
 * Content Authoring Schemas — entity contracts
 *
 * WO-010 build-time only. One `.strict()` Zod schema per content category. The
 * YAML `id` field is authoritative (never the filename). Output shapes are
 * pinned to the pure domain contracts via `satisfies`.
 */

import { z } from 'zod';
import type {
  AudioCueManifest,
  ChapterManifest,
  CodexManifest,
  DialogueManifest,
  ItemManifest,
  NpcManifest,
  QuestManifest,
  SceneManifest,
  SkillManifest,
} from '../../src/domain/content';
import { SKILL_TREES } from '../../src/domain/skills';
import { EQUIPMENT_SLOTS } from '../../src/domain/inventory';
import type { ContentCategory } from '../../src/domain/content';
import {
  isAnchorRef,
  isActRef,
  isAssetPackRef,
  isContentIdSyntax,
  isEvidenceRef,
  isLocalizationKey,
  isPlayableCharacterRef,
  isValidChoiceId,
  isValidObjectiveId,
} from '../../src/domain/content';
import { conditionSchema, effectSchema, storyFlagSchema } from './conditions';

const keySchema = z
  .string()
  .refine(
    (v) => isLocalizationKey(v),
    'localization keys must be dotted, at least three segments (e.g. chapter.ch04.title)'
  );

const plainWord = z.string().regex(/^[a-z0-9_]+$/, 'lowercase identifier with underscores');

const idField = (category: ContentCategory) =>
  z
    .string()
    .refine((v) => isContentIdSyntax(category, v), 'invalid content id (see AGENTS.md ID grammar)');

const chapterSchema = z
  .object({
    id: idField('chapter'),
    actId: z.string().refine((v) => isActRef(v), 'act reference must be act_<slug>'),
    order: z.number().int().nonnegative(),
    era: plainWord,
    titleKey: keySchema,
    playableCharacterId: z
      .string()
      .refine((v) => isPlayableCharacterRef(v), 'playable character reference must be pc_<slug>'),
    entrySceneId: z.string(),
    assetPack: z
      .string()
      .refine((v) => isAssetPackRef(v), 'asset pack reference must be pack_<slug>'),
    prerequisites: z.array(storyFlagSchema).default([]),
    canonAnchors: z
      .array(z.string().refine((v) => isAnchorRef(v), 'canon anchor must be anchor.<id>'))
      .default([]),
  })
  .strict() satisfies z.ZodType<ChapterManifest>;

const exitSchema = z
  .object({
    id: plainWord,
    labelKey: keySchema,
    toSceneId: z.string(),
  })
  .strict();

const interactableSchema = z.object({ id: plainWord }).strict();

const npcSlotSchema = z.object({ npcId: z.string() }).strict();

const sceneSchema = z
  .object({
    id: idField('scene'),
    chapterId: z.string(),
    titleKey: keySchema,
    mapId: z.string().regex(/^map_[a-z0-9_]+$/, 'map reference must be map_<slug>'),
    spawnPoints: z.array(plainWord).default([]),
    npcs: z.array(npcSlotSchema).default([]),
    interactables: z.array(interactableSchema).default([]),
    ambienceCueId: z.string().optional(),
    musicCueId: z.string().optional(),
    onEnter: z.array(effectSchema).default([]),
    exits: z.array(exitSchema).default([]),
  })
  .strict() satisfies z.ZodType<SceneManifest>;

const npcSchema = z
  .object({
    id: idField('npc'),
    nameKey: keySchema,
    role: z.string().optional(),
    era: plainWord.optional(),
    portraitSet: z.string().optional(),
    defaultDialogueId: z.string().optional(),
    relationshipPolicy: z.string().optional(),
    tags: z.array(z.string()).default([]),
  })
  .strict() satisfies z.ZodType<NpcManifest>;

const skillCheckSchema = z.object({ skillId: z.string(), threshold: z.number() }).strict();

const choiceSchema = z
  .object({
    id: z
      .string()
      .refine((v) => isValidChoiceId(v), 'choice id must be lowercase with underscores'),
    textKey: keySchema,
    conditions: z.array(conditionSchema).default([]),
    effects: z.array(effectSchema).default([]),
    skillCheck: skillCheckSchema.optional(),
    next: z.string(),
  })
  .strict();

const dialogueNodeSchema = z
  .object({
    speaker: z.string(),
    portraitState: z.string().optional(),
    textKey: keySchema,
    voiceCueId: z.string().optional(),
    tags: z.array(z.string()).default([]),
    onEnterEffects: z.array(effectSchema).default([]),
    choices: z.array(choiceSchema).default([]),
    autoNext: z.string().optional(),
  })
  .strict();

const dialogueSchema = z
  .object({
    id: idField('dialogue'),
    entryNode: z.string(),
    nodes: z.record(z.string(), dialogueNodeSchema),
  })
  .strict() satisfies z.ZodType<DialogueManifest>;

export const QUEST_INITIAL_STATES = ['locked', 'available', 'active'] as const;

export const QUEST_RESOLUTIONS = [
  'resolved_success',
  'resolved_costly',
  'resolved_failure',
  'archived',
] as const;

export const QUEST_OBJECTIVE_KINDS = [
  'collect_evidence',
  'analyze',
  'talk',
  'go_to',
  'interact',
  'choose',
  'survive',
  'repair',
  'escort',
  'wait_for_event',
] as const;

const questObjectiveSchema = z
  .object({
    id: z.string().refine((v) => isValidObjectiveId(v), 'objective id must be obj_<slug>'),
    type: z.enum(QUEST_OBJECTIVE_KINDS),
    required: z.boolean(),
    npcId: z.string().optional(),
    sceneId: z.string().optional(),
    dialogueId: z.string().optional(),
    itemIds: z.array(z.string()).optional(),
    skillIds: z.array(z.string()).optional(),
    codexIds: z.array(z.string()).optional(),
    evidenceIds: z
      .array(z.string().refine((v) => isEvidenceRef(v), 'evidence references must be ev_<slug>'))
      .optional(),
    listensFor: z
      .array(
        z.string().regex(/^[a-z0-9]+(?:\.[a-z0-9_]+)+$/, 'event names use semantic dotted form')
      )
      .default([]),
  })
  .strict();

const questSchema = z
  .object({
    id: idField('quest'),
    chapterId: z.string(),
    titleKey: keySchema,
    initialState: z.enum(QUEST_INITIAL_STATES),
    objectives: z.array(questObjectiveSchema),
    resolution: z.object({ onAllRequiredComplete: z.enum(QUEST_RESOLUTIONS) }).strict(),
    journal: z.object({ startKey: keySchema, completeKey: keySchema }).strict(),
  })
  .strict()
  .refine((q) => q.objectives.some((o) => o.required), {
    message: 'quest must declare at least one required objective',
    path: ['objectives'],
  })
  .refine((q) => new Set(q.objectives.map((o) => o.id)).size === q.objectives.length, {
    message: 'quest declares duplicate objective ids',
    path: ['objectives'],
  }) satisfies z.ZodType<QuestManifest>;

const itemSchema = z
  .object({
    id: idField('item'),
    category: plainWord,
    nameKey: keySchema,
    descriptionKey: keySchema,
    slot: z.enum(EQUIPMENT_SLOTS).optional(),
    stackable: z.boolean().default(false),
    questProtected: z.boolean().default(false),
  })
  .strict() satisfies z.ZodType<ItemManifest>;

const skillSchema = z
  .object({
    id: idField('skill'),
    tree: z.enum(SKILL_TREES),
    nameKey: keySchema,
    descriptionKey: keySchema,
  })
  .strict() satisfies z.ZodType<SkillManifest>;

export const CODEX_CATEGORIES = [
  'People',
  'Organization',
  'Science',
  'Era',
  'Places',
  'Technology',
  'Concepts',
  'Archive Fragments',
] as const;

const codexSchema = z
  .object({
    id: idField('codex'),
    category: z.enum(CODEX_CATEGORIES),
    spoilerTier: z.number().int().nonnegative(),
    unlockedAt: plainWord,
    titleKey: keySchema,
    shortKey: keySchema,
    expandedKey: keySchema,
    relatedIds: z.array(z.string()).default([]),
  })
  .strict() satisfies z.ZodType<CodexManifest>;

export const AUDIO_CUE_CATEGORIES = ['music', 'ambience', 'voice', 'sfx', 'ui'] as const;

const audioCueSchema = z
  .object({
    id: idField('audioCue'),
    category: z.enum(AUDIO_CUE_CATEGORIES),
    loop: z.boolean(),
    volume: z.number().min(0).max(1),
  })
  .strict() satisfies z.ZodType<AudioCueManifest>;

export const CONTENT_SCHEMAS_RECORD = {
  chapter: chapterSchema,
  scene: sceneSchema,
  npc: npcSchema,
  dialogue: dialogueSchema,
  quest: questSchema,
  item: itemSchema,
  skill: skillSchema,
  codex: codexSchema,
  audioCue: audioCueSchema,
} as const;

export type ContentEntityMap = {
  [Category in keyof typeof CONTENT_SCHEMAS_RECORD]: z.infer<
    (typeof CONTENT_SCHEMAS_RECORD)[Category]
  >;
};
