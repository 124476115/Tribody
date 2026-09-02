/**
 * Content Domain — ID grammar
 *
 * Content IDs are authored in the YAML `id` field and are authoritative; the
 * filename is diagnostic metadata only. Each category has a stable prefix and a
 * documented shape (AGENTS.md). The grammar lives here so run time and build
 * time share exactly one definition.
 */

import type { ContentCategory } from './types';

export const END_LITERAL = 'end';

const MAX_ID_LENGTH = 64;

const SAFE_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const CATEGORY_GRAMMAR: Readonly<Record<ContentCategory, RegExp>> = {
  // ch_<era>_<nn>_<slug>  — e.g. ch_common_04_countdown
  chapter: /^ch_[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]{2}_[a-z0-9]+(?:_[a-z0-9]+)*$/,
  // sc_ch_<nn>_<slug>  — e.g. sc_ch04_lab_morning
  scene: /^sc_ch[0-9]{2}(?:_[a-z0-9]+)*$/,
  // npc_<slug>
  npc: /^npc_/,
  // dlg_<slug>
  dialogue: /^dlg_/,
  // q_<chapter>_<slug>
  quest: /^q_/,
  // item_<category>_<slug>
  item: /^item_[a-z0-9]+_[a-z0-9_]+/,
  // skill_<tree>_<slug>
  skill: /^skill_[a-z0-9]+_[a-z0-9_]+/,
  // codex_<category>_<slug>
  codex: /^codex_[a-z0-9]+_[a-z0-9_]+/,
  // cue_<category>_<slug>  (audio cues, permanent convention from WO-010)
  audioCue: /^cue_[a-z0-9]+_[a-z0-9_]+/,
};

export function isSafeId(id: string): boolean {
  if (id.length === 0 || id.length > MAX_ID_LENGTH) return false;
  return SAFE_ID.test(id);
}

export function isContentIdSyntax(category: ContentCategory, id: string): boolean {
  if (!isSafeId(id)) return false;
  return CATEGORY_GRAMMAR[category].test(id);
}

const NODE_ID = /^[a-z][a-z0-9_]{1,31}$/;

export function isValidNodeId(id: string): boolean {
  if (id === END_LITERAL) return false;
  return NODE_ID.test(id);
}

const CHOICE_ID = /^[a-z][a-z0-9_]{1,39}$/;

export function isValidChoiceId(id: string): boolean {
  return CHOICE_ID.test(id);
}

const OBJECTIVE_ID = /^obj_[a-z0-9_]{1,36}$/;

export function isValidObjectiveId(id: string): boolean {
  return OBJECTIVE_ID.test(id);
}
