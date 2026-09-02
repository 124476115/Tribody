/**
 * Content Authoring Schemas — conditions & effects contracts
 *
 * WO-010 build-time only. Zod discriminated unions enforce the whitelisted
 * condition/effect kinds (docs/04). Canon protection lives here: `set_flag` may
 * never write a `canon.*` or `era.transition.*` anchor (narrative invariant).
 *
 * Output shapes are pinned to the pure domain contracts via `satisfies`, so any
 * drift between authoring schema and runtime contract is a compile error.
 */

import { z } from 'zod';
import type { Condition, Effect } from '../../src/domain/content';
import { isCanonProtectedFlag, isSemanticEventName, isStoryFlag } from '../../src/domain/content';

export const storyFlagSchema = z
  .string()
  .refine(
    (v) => isStoryFlag(v),
    'flag must be a chapter-scoped story flag (flag.<chapter>.<subject>.<state>)'
  );

const semanticEventSchema = z
  .string()
  .refine(
    (v) => isSemanticEventName(v),
    'event must be a semantic event name, e.g. ch04.raw_data_compare_requested'
  );

const flagCondition = z.object({ kind: z.literal('flag'), flag: storyFlagSchema }).strict();

const questStateCondition = z
  .object({ kind: z.literal('quest_state'), questId: z.string(), state: z.string() })
  .strict();

const relationshipCondition = z
  .object({
    kind: z.literal('relationship_at_least'),
    npcId: z.string(),
    dimension: z.string(),
    min: z.number(),
  })
  .strict();

const skillCondition = z
  .object({ kind: z.literal('skill_at_least'), skillId: z.string(), value: z.number() })
  .strict();

const hasItemCondition = z
  .object({
    kind: z.literal('has_item'),
    itemId: z.string(),
    count: z.number().int().positive().optional(),
  })
  .strict();

const hasCodexCondition = z.object({ kind: z.literal('has_codex'), codexId: z.string() }).strict();

const chapterStateCondition = z
  .object({ kind: z.literal('chapter_state'), chapterId: z.string() })
  .strict();

export const conditionSchema = z.discriminatedUnion('kind', [
  flagCondition,
  questStateCondition,
  relationshipCondition,
  skillCondition,
  hasItemCondition,
  hasCodexCondition,
  chapterStateCondition,
]) satisfies z.ZodType<Condition>;

const setFlagEffect = z
  .object({ kind: z.literal('set_flag'), flag: z.string() })
  .strict()
  .superRefine((value, ctx) => {
    if (isCanonProtectedFlag(value.flag)) {
      ctx.addIssue({
        code: 'custom',
        message: `cannot set canon-protected flag '${value.flag}' (macro canon anchors and era transitions are not writable by content)`,
        path: ['flag'],
      });
      return;
    }
    if (!isStoryFlag(value.flag)) {
      ctx.addIssue({
        code: 'custom',
        message: `flag '${value.flag}' is not a chapter-scoped story flag (flag.<chapter>.<subject>.<state>)`,
        path: ['flag'],
      });
    }
  });

const adjustRelationshipEffect = z
  .object({
    kind: z.literal('adjust_relationship'),
    npcId: z.string(),
    dimension: z.string(),
    amount: z.number(),
  })
  .strict();

const addItemEffect = z
  .object({
    kind: z.literal('add_item'),
    itemId: z.string(),
    count: z.number().int().positive().optional(),
  })
  .strict();

const removeItemEffect = z
  .object({
    kind: z.literal('remove_item'),
    itemId: z.string(),
    count: z.number().int().positive().optional(),
  })
  .strict();

const addCodexEffect = z.object({ kind: z.literal('add_codex'), codexId: z.string() }).strict();

const questEventEffect = z
  .object({ kind: z.literal('quest_event'), event: semanticEventSchema })
  .strict();

const awardXpEffect = z.object({ kind: z.literal('award_xp'), xp: z.number() }).strict();

const playAudioEffect = z.object({ kind: z.literal('play_audio'), cueId: z.string() }).strict();

const emitNarrativeEventEffect = z
  .object({ kind: z.literal('emit_narrative_event'), event: semanticEventSchema })
  .strict();

export const effectSchema = z.discriminatedUnion('kind', [
  setFlagEffect,
  adjustRelationshipEffect,
  addItemEffect,
  removeItemEffect,
  addCodexEffect,
  questEventEffect,
  awardXpEffect,
  playAudioEffect,
  emitNarrativeEventEffect,
]) satisfies z.ZodType<Effect>;
