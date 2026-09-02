/**
 * Content Validation Pipeline (WO-010)
 *
 * Build-time only (runs under `tsx`), so Node built-ins are fine here — but this
 * module stays off the game runtime path, keeps its own copies of nothing, and
 * reuses the pure domain contracts + authoring schemas.
 *
 * Pipeline order:
 *   1. reference detection  (content_examples/ is never validated, never built)
 *   2. YAML parse           (parse issues: malformed yaml, duplicate keys, non-map root)
 *   3. schema parse         (schema issues against the Zod authoring contracts)
 *   4. duplicate-id check
 *   5. reference integrity  (hard refs must resolve; canon already guarded in schema)
 *   6. dialogue graph rules (next/autoNext targets, reachability, cycles)
 *   7. quest contract       (enforced in schema refinements)
 *   8. localization         (missing key = error; unused key = warning; no feed = warning)
 *   9. normalization + manifest build (maps key-sorted, gameplay arrays in author order)
 *  10. sha256 source hash   (over the canonical payload, deterministic)
 *
 * All deterministic output uses `canonicalStringify`: object keys are sorted
 * recursively, but ARRAYS keep their author-given order.
 */

import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { CONTENT_SCHEMAS_RECORD } from '../../schemas/content';
import type { ContentEntityMap } from '../../schemas/content';
import { END_LITERAL, isLocalizationKey, isValidNodeId } from '../../src/domain/content';
import type {
  AudioCueManifest,
  ChapterManifest,
  CodexManifest,
  Condition,
  ContentCategory,
  ContentIssue,
  ContentManifest,
  DialogueChoiceManifest,
  DialogueManifest,
  DialogueNodeManifest,
  Effect,
  ItemManifest,
  IssueCategory,
  IssueSeverity,
  NpcManifest,
  QuestManifest,
  SceneManifest,
  SkillManifest,
} from '../../src/domain/content';

export const SCHEMA_VERSION = '1.0.0' as const;
export const DEFAULT_CONTENT_VERSION = '0.1.0';

export interface ContentSource {
  category: ContentCategory;
  file: string;
  source: string;
}

export interface LocaleSource {
  locale: string;
  file: string;
  source: string;
}

export interface ContentInput {
  sources: readonly ContentSource[];
  localeSources?: readonly LocaleSource[];
  contentVersion?: string;
}

export interface ContentValidationResult {
  issues: readonly ContentIssue[];
  manifest: ContentManifest | null;
}

function makeIssue(
  severity: IssueSeverity,
  category: IssueCategory,
  file: string,
  message: string,
  contentId?: string,
  path?: string
): ContentIssue {
  const base = { severity, category, file, message };
  const withId = contentId === undefined ? base : { ...base, contentId };
  return path === undefined ? withId : { ...withId, path };
}

function isReferenceDocument(file: string): boolean {
  return file.split(/[/\\]/).includes('content_examples');
}

/* ---------------------------------------------------------------------------
 * YAML layer
 * ------------------------------------------------------------------------ */

interface YamlLoad {
  issues: ContentIssue[];
  data: Record<string, unknown> | null;
}

const NON_MAPPING_ROOT = 'document root must be a mapping (key-value object)';

function loadYaml(file: string, source: string): YamlLoad {
  const issues: ContentIssue[] = [];
  let doc;
  try {
    doc = parseDocument(source, { strict: true, uniqueKeys: true });
  } catch {
    return { issues: [makeIssue('error', 'parse', file, 'unable to parse yaml')], data: null };
  }
  if (doc.errors.length > 0) {
    for (const err of doc.errors) {
      issues.push(makeIssue('error', 'parse', file, `malformed yaml: ${err.message}`));
    }
    return { issues, data: null };
  }
  let data: unknown;
  try {
    data = doc.toJS({ maxAliasCount: 100 });
  } catch {
    return {
      issues: [makeIssue('error', 'parse', file, 'yaml aliases exceeded the allowed limit')],
      data: null,
    };
  }
  if (data === null || data === undefined) {
    return { issues: [makeIssue('error', 'parse', file, NON_MAPPING_ROOT)], data: null };
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { issues: [makeIssue('error', 'parse', file, NON_MAPPING_ROOT)], data: null };
  }
  return { issues, data: data as Record<string, unknown> };
}

/* ---------------------------------------------------------------------------
 * Schema layer
 * ------------------------------------------------------------------------ */

interface DocRecord<Category extends ContentCategory> {
  file: string;
  doc: ContentEntityMap[Category];
}

type DocGroups = { [Category in ContentCategory]: DocRecord<Category>[] };

function emptyGroups(): DocGroups {
  return {
    chapter: [],
    scene: [],
    npc: [],
    dialogue: [],
    quest: [],
    item: [],
    skill: [],
    codex: [],
    audioCue: [],
  };
}

function parseWithSchema<Category extends ContentCategory>(
  category: Category,
  file: string,
  data: unknown
): { ok: true; doc: ContentEntityMap[Category] } | { ok: false; issues: ContentIssue[] } {
  const schema = CONTENT_SCHEMAS_RECORD[category] as unknown as z.ZodType<
    ContentEntityMap[Category]
  >;
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, doc: result.data };
  }
  const issues = result.error.issues.map((i) =>
    makeIssue('error', 'schema', file, i.message, undefined, i.path.join('.'))
  );
  return { ok: false, issues };
}

/* ---------------------------------------------------------------------------
 * Checks
 * ------------------------------------------------------------------------ */

function checkDuplicateIds(groups: DocGroups, issues: ContentIssue[]): void {
  const categories = Object.keys(groups) as readonly ContentCategory[];
  for (const category of categories) {
    const firstFile = new Map<string, string>();
    for (const rec of groups[category]) {
      const prev = firstFile.get(rec.doc.id);
      if (prev === undefined) {
        firstFile.set(rec.doc.id, rec.file);
      } else {
        issues.push(
          makeIssue(
            'error',
            'duplicate-id',
            rec.file,
            `duplicate id '${rec.doc.id}' (category ${category}): already declared in ${prev}`,
            rec.doc.id
          )
        );
      }
    }
  }
}

interface EntityIndex {
  npcs: ReadonlyMap<string, string>;
  dialogues: ReadonlyMap<string, string>;
  scenes: ReadonlyMap<string, string>;
  chapters: ReadonlyMap<string, string>;
  quests: ReadonlyMap<string, string>;
  items: ReadonlyMap<string, string>;
  skills: ReadonlyMap<string, string>;
  codex: ReadonlyMap<string, string>;
  audioCues: ReadonlyMap<string, string>;
}

function buildEntityIndex(groups: DocGroups): EntityIndex {
  const indexOf = <Category extends ContentCategory>(
    recs: readonly DocRecord<Category>[]
  ): ReadonlyMap<string, string> => new Map<string, string>(recs.map((r) => [r.doc.id, r.file]));
  return {
    npcs: indexOf(groups.npc),
    dialogues: indexOf(groups.dialogue),
    scenes: indexOf(groups.scene),
    chapters: indexOf(groups.chapter),
    quests: indexOf(groups.quest),
    items: indexOf(groups.item),
    skills: indexOf(groups.skill),
    codex: indexOf(groups.codex),
    audioCues: indexOf(groups.audioCue),
  };
}

function pushMissing(
  issues: ContentIssue[],
  file: string,
  contentId: string,
  target: string,
  path: string
): void {
  issues.push(
    makeIssue(
      'error',
      'missing-ref',
      file,
      `reference '${target}' does not resolve to an existing content entity`,
      contentId,
      path
    )
  );
}

function pushMissingRef(
  issues: ContentIssue[],
  file: string,
  contentId: string,
  target: string,
  path: string
): void {
  pushMissing(issues, file, contentId, target, path);
}

const RESERVED_SPEAKERS: ReadonlySet<string> = new Set(['narrator', 'player']);

function checkCondition(
  condition: Condition,
  index: EntityIndex,
  issues: ContentIssue[],
  file: string,
  contentId: string,
  path: string
): void {
  switch (condition.kind) {
    case 'flag':
      break;
    case 'quest_state':
      if (!index.quests.has(condition.questId))
        pushMissingRef(issues, file, contentId, condition.questId, path);
      break;
    case 'relationship_at_least':
      if (!index.npcs.has(condition.npcId))
        pushMissingRef(issues, file, contentId, condition.npcId, path);
      break;
    case 'skill_at_least':
      if (!index.skills.has(condition.skillId))
        pushMissingRef(issues, file, contentId, condition.skillId, path);
      break;
    case 'has_item':
      if (!index.items.has(condition.itemId))
        pushMissingRef(issues, file, contentId, condition.itemId, path);
      break;
    case 'has_codex':
      if (!index.codex.has(condition.codexId))
        pushMissingRef(issues, file, contentId, condition.codexId, path);
      break;
    case 'chapter_state':
      if (!index.chapters.has(condition.chapterId))
        pushMissingRef(issues, file, contentId, condition.chapterId, path);
      break;
    default:
      break;
  }
}

function checkEffect(
  effect: Effect,
  index: EntityIndex,
  issues: ContentIssue[],
  file: string,
  contentId: string,
  path: string
): void {
  switch (effect.kind) {
    case 'adjust_relationship':
      if (!index.npcs.has(effect.npcId))
        pushMissingRef(issues, file, contentId, effect.npcId, path);
      break;
    case 'add_item':
    case 'remove_item':
      if (!index.items.has(effect.itemId))
        pushMissingRef(issues, file, contentId, effect.itemId, path);
      break;
    case 'add_codex':
      if (!index.codex.has(effect.codexId))
        pushMissingRef(issues, file, contentId, effect.codexId, path);
      break;
    case 'play_audio':
      if (!index.audioCues.has(effect.cueId))
        pushMissingRef(issues, file, contentId, effect.cueId, path);
      break;
    case 'set_flag':
    case 'quest_event':
    case 'award_xp':
    case 'emit_narrative_event':
      break;
    default:
      break;
  }
}

function checkChoiceEffectsAndConditions(
  choice: DialogueChoiceManifest,
  index: EntityIndex,
  issues: ContentIssue[],
  file: string,
  contentId: string,
  nodeId: string
): void {
  const base = `nodes.${nodeId}.choices.${choice.id}`;
  choice.conditions.forEach((c, idx) => {
    checkCondition(c, index, issues, file, contentId, `${base}.conditions[${String(idx)}]`);
  });
  choice.effects.forEach((e, idx) => {
    checkEffect(e, index, issues, file, contentId, `${base}.effects[${String(idx)}]`);
  });
  if (choice.skillCheck !== undefined && !index.skills.has(choice.skillCheck.skillId)) {
    pushMissingRef(
      issues,
      file,
      contentId,
      choice.skillCheck.skillId,
      `${base}.skillCheck.skillId`
    );
  }
}

function checkDialogueRefs(
  dialogue: DialogueManifest,
  file: string,
  index: EntityIndex,
  issues: ContentIssue[]
): void {
  for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
    if (!RESERVED_SPEAKERS.has(node.speaker) && !index.npcs.has(node.speaker)) {
      pushMissingRef(issues, file, dialogue.id, node.speaker, `nodes.${nodeId}.speaker`);
    }
    node.onEnterEffects.forEach((e, idx) => {
      checkEffect(
        e,
        index,
        issues,
        file,
        dialogue.id,
        `nodes.${nodeId}.onEnterEffects[${String(idx)}]`
      );
    });
    node.choices.forEach((choice) => {
      checkChoiceEffectsAndConditions(choice, index, issues, file, dialogue.id, nodeId);
    });
    if (node.voiceCueId !== undefined && !index.audioCues.has(node.voiceCueId)) {
      pushMissingRef(issues, file, dialogue.id, node.voiceCueId, `nodes.${nodeId}.voiceCueId`);
    }
  }
}

function checkAllRefs(groups: DocGroups, index: EntityIndex, issues: ContentIssue[]): void {
  for (const rec of groups.chapter) {
    if (!index.scenes.has(rec.doc.entrySceneId)) {
      pushMissingRef(issues, rec.file, rec.doc.id, rec.doc.entrySceneId, 'entrySceneId');
    }
  }
  for (const rec of groups.scene) {
    if (!index.chapters.has(rec.doc.chapterId)) {
      pushMissingRef(issues, rec.file, rec.doc.id, rec.doc.chapterId, 'chapterId');
    }
    for (const slot of rec.doc.npcs) {
      if (!index.npcs.has(slot.npcId))
        pushMissingRef(issues, rec.file, rec.doc.id, slot.npcId, 'npcs');
    }
    for (const exit of rec.doc.exits) {
      if (!index.scenes.has(exit.toSceneId)) {
        pushMissingRef(issues, rec.file, rec.doc.id, exit.toSceneId, `exits.${exit.id}.toSceneId`);
      }
    }
    if (rec.doc.ambienceCueId !== undefined && !index.audioCues.has(rec.doc.ambienceCueId)) {
      pushMissingRef(issues, rec.file, rec.doc.id, rec.doc.ambienceCueId, 'ambienceCueId');
    }
    if (rec.doc.musicCueId !== undefined && !index.audioCues.has(rec.doc.musicCueId)) {
      pushMissingRef(issues, rec.file, rec.doc.id, rec.doc.musicCueId, 'musicCueId');
    }
    rec.doc.onEnter.forEach((e, idx) => {
      checkEffect(e, index, issues, rec.file, rec.doc.id, `onEnter[${String(idx)}]`);
    });
  }
  for (const rec of groups.npc) {
    if (
      rec.doc.defaultDialogueId !== undefined &&
      !index.dialogues.has(rec.doc.defaultDialogueId)
    ) {
      pushMissingRef(issues, rec.file, rec.doc.id, rec.doc.defaultDialogueId, 'defaultDialogueId');
    }
  }
  for (const rec of groups.dialogue) {
    checkDialogueRefs(rec.doc, rec.file, index, issues);
  }
  for (const rec of groups.quest) {
    if (!index.chapters.has(rec.doc.chapterId)) {
      pushMissingRef(issues, rec.file, rec.doc.id, rec.doc.chapterId, 'chapterId');
    }
    for (const objective of rec.doc.objectives) {
      const base = `objectives.${objective.id}`;
      if (objective.npcId !== undefined && !index.npcs.has(objective.npcId)) {
        pushMissingRef(issues, rec.file, rec.doc.id, objective.npcId, `${base}.npcId`);
      }
      if (objective.sceneId !== undefined && !index.scenes.has(objective.sceneId)) {
        pushMissingRef(issues, rec.file, rec.doc.id, objective.sceneId, `${base}.sceneId`);
      }
      if (objective.dialogueId !== undefined && !index.dialogues.has(objective.dialogueId)) {
        pushMissingRef(issues, rec.file, rec.doc.id, objective.dialogueId, `${base}.dialogueId`);
      }
      for (const id of objective.itemIds ?? []) {
        if (!index.items.has(id))
          pushMissingRef(issues, rec.file, rec.doc.id, id, `${base}.itemIds`);
      }
      for (const id of objective.skillIds ?? []) {
        if (!index.skills.has(id))
          pushMissingRef(issues, rec.file, rec.doc.id, id, `${base}.skillIds`);
      }
      for (const id of objective.codexIds ?? []) {
        if (!index.codex.has(id))
          pushMissingRef(issues, rec.file, rec.doc.id, id, `${base}.codexIds`);
      }
    }
  }
}

/* -- dialogue graph ------------------------------------------------------ */

function findAutoNextCycles(nodes: Record<string, DialogueNodeManifest>): string[][] {
  const state = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const visit = (nodeId: string): void => {
    const current = state.get(nodeId) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      const at = stack.indexOf(nodeId);
      if (at >= 0) cycles.push([...stack.slice(at), nodeId]);
      return;
    }
    state.set(nodeId, 1);
    stack.push(nodeId);
    const node = nodes[nodeId];
    const next = node?.autoNext;
    if (next !== undefined && next !== END_LITERAL) {
      visit(next);
    }
    stack.pop();
    state.set(nodeId, 2);
  };

  for (const nodeId of Object.keys(nodes)) {
    if ((state.get(nodeId) ?? 0) === 0) visit(nodeId);
  }
  return cycles;
}

function checkDialogueGraph(
  dialogue: DialogueManifest,
  file: string,
  issues: ContentIssue[]
): void {
  const nodeIds = new Set(Object.keys(dialogue.nodes));
  for (const nodeId of nodeIds) {
    if (!isValidNodeId(nodeId)) {
      issues.push(
        makeIssue(
          'error',
          'id',
          file,
          `node id '${nodeId}' does not match the dialogue node grammar`,
          dialogue.id,
          `nodes.${nodeId}`
        )
      );
    }
  }

  if (!nodeIds.has(dialogue.entryNode)) {
    issues.push(
      makeIssue(
        'error',
        'graph',
        file,
        `entryNode '${dialogue.entryNode}' does not exist in dialogue`,
        dialogue.id,
        'entryNode'
      )
    );
  }

  for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
    const choiceIds = new Set<string>();
    for (const choice of node.choices) {
      if (choiceIds.has(choice.id)) {
        issues.push(
          makeIssue(
            'error',
            'graph',
            file,
            `duplicate choice id '${choice.id}' in node '${nodeId}'`,
            dialogue.id,
            `nodes.${nodeId}.choices`
          )
        );
      }
      choiceIds.add(choice.id);
      if (choice.next !== END_LITERAL && !nodeIds.has(choice.next)) {
        issues.push(
          makeIssue(
            'error',
            'graph',
            file,
            `choice '${choice.id}' next '${choice.next}' does not resolve to a node in dialogue`,
            dialogue.id,
            `nodes.${nodeId}.choices.${choice.id}.next`
          )
        );
      }
    }
    if (
      node.autoNext !== undefined &&
      node.autoNext !== END_LITERAL &&
      !nodeIds.has(node.autoNext)
    ) {
      issues.push(
        makeIssue(
          'error',
          'graph',
          file,
          `autoNext '${node.autoNext}' does not resolve to a node in dialogue`,
          dialogue.id,
          `nodes.${nodeId}.autoNext`
        )
      );
    }
  }

  const reachable = new Set<string>();
  const stack: string[] = [dialogue.entryNode];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || reachable.has(current)) continue;
    reachable.add(current);
    const node = dialogue.nodes[current];
    if (node === undefined) continue;
    for (const choice of node.choices) {
      if (choice.next !== END_LITERAL) stack.push(choice.next);
    }
    if (node.autoNext !== undefined && node.autoNext !== END_LITERAL) stack.push(node.autoNext);
  }
  for (const nodeId of nodeIds) {
    if (!reachable.has(nodeId)) {
      issues.push(
        makeIssue(
          'error',
          'graph',
          file,
          `node '${nodeId}' is unreachable from entry node '${dialogue.entryNode}'`,
          dialogue.id,
          `nodes.${nodeId}`
        )
      );
    }
  }

  for (const cycle of findAutoNextCycles(dialogue.nodes)) {
    issues.push(
      makeIssue(
        'error',
        'graph',
        file,
        `autoNext cycle detected: ${cycle.join(' → ')}`,
        dialogue.id,
        'autoNext'
      )
    );
  }
}

function checkAllDialogueGraphs(groups: DocGroups, issues: ContentIssue[]): void {
  for (const rec of groups.dialogue) checkDialogueGraph(rec.doc, rec.file, issues);
}

/* -- quest contract (schema refinements applied at parse time) ------------- */

/* -- localization -------------------------------------------------------- */

type LocaleMaps = ReadonlyMap<string, ReadonlyMap<string, string>>;

function loadLocales(localeSources: readonly LocaleSource[], issues: ContentIssue[]): LocaleMaps {
  const byLocale = new Map<string, Map<string, string>>();
  const seenByLocale = new Map<string, Set<string>>();
  for (const ls of localeSources) {
    const loaded = loadYaml(ls.file, ls.source);
    issues.push(...loaded.issues);
    if (loaded.data === null) continue;
    let map = byLocale.get(ls.locale);
    if (map === undefined) {
      map = new Map<string, string>();
      byLocale.set(ls.locale, map);
    }
    let seen = seenByLocale.get(ls.locale);
    if (seen === undefined) {
      seen = new Set<string>();
      seenByLocale.set(ls.locale, seen);
    }
    for (const [key, value] of Object.entries(loaded.data)) {
      if (!isLocalizationKey(key)) {
        issues.push(
          makeIssue(
            'error',
            'localization',
            ls.file,
            `locale key '${key}' is not a valid localization key`
          )
        );
        continue;
      }
      if (typeof value !== 'string') {
        issues.push(
          makeIssue('error', 'localization', ls.file, `locale key '${key}' must map to a string`)
        );
        continue;
      }
      if (seen.has(key)) {
        issues.push(
          makeIssue(
            'error',
            'localization',
            ls.file,
            `locale key '${key}' is declared in multiple ${ls.locale} locale files`
          )
        );
        continue;
      }
      seen.add(key);
      map.set(key, value);
    }
  }
  return byLocale;
}

function collectUsedKeys(groups: DocGroups): Set<string> {
  const used = new Set<string>();
  const add = (value: string | undefined): void => {
    if (value !== undefined) used.add(value);
  };
  for (const rec of groups.chapter) add(rec.doc.titleKey);
  for (const rec of groups.scene) {
    add(rec.doc.titleKey);
    for (const exit of rec.doc.exits) add(exit.labelKey);
  }
  for (const rec of groups.npc) add(rec.doc.nameKey);
  for (const rec of groups.item) {
    add(rec.doc.nameKey);
    add(rec.doc.descriptionKey);
  }
  for (const rec of groups.skill) {
    add(rec.doc.nameKey);
    add(rec.doc.descriptionKey);
  }
  for (const rec of groups.codex) {
    add(rec.doc.titleKey);
    add(rec.doc.shortKey);
    add(rec.doc.expandedKey);
  }
  for (const rec of groups.quest) {
    add(rec.doc.titleKey);
    add(rec.doc.journal.startKey);
    add(rec.doc.journal.completeKey);
  }
  for (const rec of groups.dialogue) {
    for (const node of Object.values(rec.doc.nodes)) {
      add(node.textKey);
      for (const choice of node.choices) add(choice.textKey);
    }
  }
  return used;
}

function checkLocales(
  byLocale: LocaleMaps,
  feedPresent: boolean,
  usedKeys: Set<string>,
  issues: ContentIssue[]
): void {
  if (!feedPresent) {
    issues.push(
      makeIssue(
        'warning',
        'localization',
        '',
        'no localization feed provided; content key existence was not verified'
      )
    );
    return;
  }
  if (byLocale.size === 0) return;
  const declared = new Set<string>();
  for (const map of byLocale.values()) {
    for (const key of map.keys()) declared.add(key);
  }
  for (const key of usedKeys) {
    if (!declared.has(key)) {
      issues.push(
        makeIssue(
          'error',
          'localization',
          '',
          `localization key '${key}' is not defined in any locale file`
        )
      );
    }
  }
  for (const key of declared) {
    if (!usedKeys.has(key)) {
      issues.push(
        makeIssue(
          'warning',
          'localization',
          '',
          `locale key '${key}' is unused by any content document`
        )
      );
    }
  }
}

/* -- manifest ------------------------------------------------------------ */

function sortedRecord<Value>(input: ReadonlyMap<string, Value>): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const key of [...input.keys()].sort()) {
    const value = input.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function sortedObject<Value>(input: Record<string, Value>): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const key of Object.keys(input).sort()) {
    const value = input[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function buildManifest(
  groups: DocGroups,
  byLocale: LocaleMaps,
  contentVersion: string | undefined
): ContentManifest {
  const toRecord = <Category extends ContentCategory>(
    recs: readonly DocRecord<Category>[]
  ): Record<string, ContentEntityMap[Category]> => {
    const rec: Record<string, ContentEntityMap[Category]> = {};
    for (const r of recs) rec[r.doc.id] = r.doc;
    return sortedObject(rec);
  };

  const chapters = toRecord(groups.chapter) as Record<string, ChapterManifest>;
  const scenes = toRecord(groups.scene) as Record<string, SceneManifest>;
  const npcs = toRecord(groups.npc) as Record<string, NpcManifest>;
  const quests = toRecord(groups.quest) as Record<string, QuestManifest>;
  const items = toRecord(groups.item) as Record<string, ItemManifest>;
  const skills = toRecord(groups.skill) as Record<string, SkillManifest>;
  const codex = toRecord(groups.codex) as Record<string, CodexManifest>;
  const audioCues = toRecord(groups.audioCue) as Record<string, AudioCueManifest>;

  const dialogues: Record<string, DialogueManifest> = {};
  for (const rec of groups.dialogue) {
    dialogues[rec.doc.id] = { ...rec.doc, nodes: sortedObject(rec.doc.nodes) };
  }
  const orderedDialogues: Record<string, DialogueManifest> = {};
  for (const id of Object.keys(dialogues).sort()) {
    const value = dialogues[id];
    if (value !== undefined) orderedDialogues[id] = value;
  }

  const localization: Record<string, Record<string, string>> = {};
  for (const [localeName, map] of byLocale) {
    localization[localeName] = sortedRecord(map);
  }

  const manifest: ContentManifest = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      contentVersion: contentVersion ?? DEFAULT_CONTENT_VERSION,
      sourceHash: '',
    },
    chapters,
    scenes,
    npcs,
    dialogues: orderedDialogues,
    quests,
    items,
    skills,
    codex,
    audioCues,
    localization,
  };

  const payload = canonicalStringify({
    chapters,
    scenes,
    npcs,
    dialogues: orderedDialogues,
    quests,
    items,
    skills,
    codex,
    audioCues,
    localization,
  });
  manifest.meta.sourceHash = createHash('sha256').update(payload).digest('hex');
  return manifest;
}

export function canonicalStringify(value: unknown): string {
  const json = JSON.stringify(sortDeep(value));
  return typeof json === 'string' ? json : '';
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => sortDeep(v));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function serializeManifest(manifest: ContentManifest): string {
  return canonicalStringify(manifest);
}

/* ---------------------------------------------------------------------------
 * Public entry
 * ------------------------------------------------------------------------ */

export function validateContent(input: ContentInput): ContentValidationResult {
  const issues: ContentIssue[] = [];
  const groups = emptyGroups();

  for (const source of input.sources) {
    if (isReferenceDocument(source.file)) continue;
    const loaded = loadYaml(source.file, source.source);
    issues.push(...loaded.issues);
    if (loaded.data === null) continue;
    const parsed = parseWithSchema(source.category, source.file, loaded.data);
    if (parsed.ok) {
      const target = groups[source.category] as DocRecord<ContentCategory>[];
      target.push({ file: source.file, doc: parsed.doc });
    } else {
      issues.push(...parsed.issues);
    }
  }

  checkDuplicateIds(groups, issues);
  const index = buildEntityIndex(groups);
  checkAllRefs(groups, index, issues);
  checkAllDialogueGraphs(groups, issues);

  const localeSources = input.localeSources ?? [];
  const byLocale = loadLocales(localeSources, issues);
  const usedKeys = collectUsedKeys(groups);
  checkLocales(byLocale, localeSources.length > 0, usedKeys, issues);

  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const manifest = hasErrors ? null : buildManifest(groups, byLocale, input.contentVersion);
  return { issues, manifest };
}
