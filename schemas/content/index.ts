/**
 * Content Authoring Schemas — entry point
 *
 * WO-010 build tooling only. Runtime code must NOT import Zod or these schemas;
 * it consumes the pure contracts from `src/domain/content`.
 */

export { conditionSchema, effectSchema, storyFlagSchema } from './conditions';
export {
  AUDIO_CUE_CATEGORIES,
  CODEX_CATEGORIES,
  CONTENT_SCHEMAS_RECORD,
  QUEST_INITIAL_STATES,
  QUEST_OBJECTIVE_KINDS,
  QUEST_RESOLUTIONS,
} from './entities';
export type { ContentEntityMap } from './entities';
