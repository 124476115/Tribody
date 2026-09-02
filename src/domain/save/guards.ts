/**
 * Save System — structural guards (FS-SAVE-001)
 *
 * Pure TypeScript. Two distinct stages with disjoint responsibilities:
 * - Generic JSON-safety walk (`assertJSONShape`): depth, dangerous keys, JSON
 *   value types. This is FORWARD-COMPATIBLE by design — nothing here rejects
 *   unknown top-level or payload keys (that is the version-specific stage's
 *   job and it runs only after checksum verification).
 * - Version-specific payload guard (`validatePayloadForVersion`): strict,
 *   per-version whitelists. Strict only for the recorded version.
 */
import { fail } from './errors';
import type { SavePayload } from './types';
import { MAX_NESTING_DEPTH } from './types';
import { isCanonicalSkill } from '../skills';
import { isContentIdSyntax } from '../content';
import { EQUIPMENT_SLOTS } from '../inventory';

export { MAX_NESTING_DEPTH };

const DANGEROUS_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp)
  );
}

function walkShape(value: unknown, depth: number, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('corrupt-shape', `non-finite number at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    if (depth > MAX_NESTING_DEPTH) {
      fail('corrupt-shape', `nesting exceeds ${String(MAX_NESTING_DEPTH)} at ${path}`);
    }
    value.forEach((item, index) => {
      walkShape(item, depth + 1, `${path}[${String(index)}]`);
    });
    return;
  }
  if (typeof value === 'object') {
    if (value instanceof Date) fail('corrupt-shape', `Date value at ${path}`);
    if (value instanceof RegExp) fail('corrupt-shape', `RegExp value at ${path}`);
    if (depth > MAX_NESTING_DEPTH) {
      fail('corrupt-shape', `nesting exceeds ${String(MAX_NESTING_DEPTH)} at ${path}`);
    }
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) fail('corrupt-shape', `dangerous key ${key} at ${path}`);
      walkShape((value as Record<string, unknown>)[key], depth + 1, `${path}.${key}`);
    }
    return;
  }
  fail('corrupt-shape', `unsupported value (${typeof value}) at ${path}`);
}

/**
 * Parse a save blob. JSON syntax errors are corrupt-json; a valid-JSON value
 * that is not an object is corrupt-shape.
 */
export function parseJSON(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    fail('corrupt-json', 'save blob is not valid JSON');
  }
}

/**
 * Generic, forward-compatible JSON-safety walk on an already-parsed value.
 * Depth, dangerous keys, and JSON value types only.
 */
export function assertJSONShape(value: unknown): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    fail('corrupt-shape', 'save root must be a plain object');
  }
  walkShape(value, 0, '$');
}

export interface SaveHeader {
  schemaVersion: number;
  checksum: string;
  payload: unknown;
}

export interface SaveHeaderExtras {
  contentVersion: string;
  gameVersion: string;
  createdAt: number;
}

/**
 * Forward-compatible header validation: checks ONLY the header fields
 * (schemaVersion integer >= 1, checksum string, payload present). Unknown
 * top-level fields and unknown payload keys are NOT rejected here.
 */
export function assertHeaderShape(parsed: unknown): asserts parsed is Record<string, unknown> {
  assertJSONShape(parsed);
  const record = parsed;
  const schemaVersion = record['schemaVersion'];
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    fail('corrupt-shape', 'schemaVersion must be a positive integer');
  }
  const checksum = record['checksum'];
  if (typeof checksum !== 'string' || checksum.length === 0) {
    fail('corrupt-shape', 'checksum must be a non-empty string');
  }
  if (!('payload' in record)) {
    fail('corrupt-shape', 'payload field missing');
  }
}

export function extractHeader(parsed: unknown): SaveHeader {
  assertHeaderShape(parsed);
  const record = parsed;
  return {
    schemaVersion: record['schemaVersion'] as number,
    checksum: record['checksum'] as string,
    payload: record['payload'],
  };
}

/** Reads the three header-bound fields that participate in the checksum body. */
export function extractHeaderExtras(parsed: unknown): SaveHeaderExtras {
  const record = parsed as Record<string, unknown>;
  const contentVersion = record['contentVersion'];
  const gameVersion = record['gameVersion'];
  const createdAt = record['createdAt'];
  if (typeof contentVersion !== 'string') fail('corrupt-shape', 'contentVersion must be a string');
  if (typeof gameVersion !== 'string') fail('corrupt-shape', 'gameVersion must be a string');
  if (typeof createdAt !== 'number' || !Number.isInteger(createdAt) || createdAt < 0) {
    fail('corrupt-shape', 'createdAt must be a non-negative integer');
  }
  return { contentVersion, gameVersion, createdAt };
}

// ---------------------------------------------------------------------------
// Version-specific strict guards
// ---------------------------------------------------------------------------

const DIALOGUE_MODES: ReadonlySet<string> = new Set(['onNode', 'awaitingSkillCheck', 'ended']);
const QUEST_STATUSES: ReadonlySet<string> = new Set([
  'locked',
  'available',
  'active',
  'resolved_success',
  'resolved_costly',
  'resolved_failure',
  'archived',
]);
const DIALOGUE_HISTORY_KINDS: ReadonlySet<string> = new Set([
  'started',
  'node_entered',
  'choice_selected',
  'ended',
]);
const QUEST_TRANSITION_KINDS: ReadonlySet<string> = new Set([
  'quest_started',
  'objective_progressed',
  'objective_completed',
  'quest_resolved',
  'quest_archived',
]);
const RESOLUTIONS: ReadonlySet<string> = new Set([
  'resolved_success',
  'resolved_costly',
  'resolved_failure',
  'archived',
]);
const CHECKPOINT_SCOPES: ReadonlySet<string> = new Set([
  'chapter_enter',
  'autosave',
  'manual',
  'quick',
]);

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainRecord(value)) fail('corrupt-shape', `${path} must be a plain object`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail('corrupt-shape', `${path} must be a string`);
  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail('corrupt-shape', `${path} must be an array of strings`);
  }
  return value as string[];
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail('corrupt-shape', `${path} must be a non-negative integer`);
  }
  return value;
}

function requireExactKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail('corrupt-shape', `${path} has unknown key "${key}"`);
  }
}

const HEADER_KEYS: ReadonlySet<string> = new Set([
  'activeChapterId',
  'activeSceneId',
  'checkpoint',
  'playtimeMinutes',
  'domain',
]);

function validateCheckpoint(value: unknown, path: string): void {
  if (value === null) return;
  const checkpoint = requireObject(value, path);
  requireExactKeys(checkpoint, new Set(['chapterId', 'sceneId', 'scope']), path);
  requireString(checkpoint['chapterId'], `${path}.chapterId`);
  requireString(checkpoint['sceneId'], `${path}.sceneId`);
  const scope = checkpoint['scope'];
  if (typeof scope !== 'string' || !CHECKPOINT_SCOPES.has(scope))
    fail('corrupt-shape', `${path}.scope invalid`);
}

const SESSION_KEYS: ReadonlySet<string> = new Set([
  'dialogueId',
  'instanceOrdinal',
  'mode',
  'nodeId',
  'pendingCheck',
  'nextTransitionOrdinal',
  'history',
]);
const PENDING_KEYS: ReadonlySet<string> = new Set(['nodeId', 'choiceId']);
const DIALOGUE_HISTORY_ALLOWED: ReadonlySet<string> = new Set([
  'kind',
  'dialogueId',
  'transitionId',
  'seq',
  'nodeId',
  'choiceId',
  'outcome',
]);

function validateDialogue(value: unknown, path: string): void {
  const dialogue = requireObject(value, path);
  requireExactKeys(
    dialogue,
    new Set(['active', 'processedRequestIds', 'nextInstanceOrdinal']),
    path
  );
  const active = dialogue['active'];
  if (active !== null) {
    const session = requireObject(active, `${path}.active`);
    requireExactKeys(session, SESSION_KEYS, `${path}.active`);
    requireString(session['dialogueId'], `${path}.active.dialogueId`);
    requireNonNegativeInteger(session['instanceOrdinal'], `${path}.active.instanceOrdinal`);
    const mode = session['mode'];
    if (typeof mode !== 'string' || !DIALOGUE_MODES.has(mode)) {
      fail('corrupt-shape', `${path}.active.mode invalid`);
    }
    const nodeId = session['nodeId'];
    if (nodeId !== null && typeof nodeId !== 'string')
      fail('corrupt-shape', `${path}.active.nodeId invalid`);
    const pending = session['pendingCheck'];
    if (pending !== null) {
      const pendingRecord = requireObject(pending, `${path}.active.pendingCheck`);
      requireExactKeys(pendingRecord, PENDING_KEYS, `${path}.active.pendingCheck`);
      requireString(pendingRecord['nodeId'], `${path}.active.pendingCheck.nodeId`);
      requireString(pendingRecord['choiceId'], `${path}.active.pendingCheck.choiceId`);
    }
    requireNonNegativeInteger(
      session['nextTransitionOrdinal'],
      `${path}.active.nextTransitionOrdinal`
    );
    const history = session['history'];
    if (!Array.isArray(history)) fail('corrupt-shape', `${path}.active.history must be an array`);
    history.forEach((entry, index) => {
      const e = requireObject(entry, `${path}.active.history[${String(index)}]`);
      requireExactKeys(e, DIALOGUE_HISTORY_ALLOWED, `${path}.active.history[${String(index)}]`);
      const kind = e['kind'];
      if (typeof kind !== 'string' || !DIALOGUE_HISTORY_KINDS.has(kind)) {
        fail('corrupt-shape', `${path}.active.history[${String(index)}].kind invalid`);
      }
      requireString(e['dialogueId'], `${path}.active.history[${String(index)}].dialogueId`);
      requireString(e['transitionId'], `${path}.active.history[${String(index)}].transitionId`);
      requireNonNegativeInteger(e['seq'], `${path}.active.history[${String(index)}].seq`);
    });
  }
  requireStringArray(dialogue['processedRequestIds'], `${path}.processedRequestIds`);
  const ordinals = requireObject(dialogue['nextInstanceOrdinal'], `${path}.nextInstanceOrdinal`);
  for (const key of Object.keys(ordinals)) {
    requireNonNegativeInteger(ordinals[key], `${path}.nextInstanceOrdinal.${key}`);
  }
}

const OBJECTIVE_KEYS: ReadonlySet<string> = new Set(['objectiveId', 'complete', 'matchedKeys']);
const QUEST_STATE_KEYS: ReadonlySet<string> = new Set([
  'questId',
  'status',
  'objectives',
  'processedEventIds',
  'nextTransitionOrdinal',
  'history',
]);
const QUEST_HISTORY_ALLOWED: ReadonlySet<string> = new Set([
  'kind',
  'questId',
  'transitionId',
  'seq',
  'eventId',
  'objectiveIds',
  'resolution',
]);

function validateQuest(value: unknown, path: string): void {
  const questDomain = requireObject(value, path);
  requireExactKeys(questDomain, new Set(['quests']), path);
  const quests = requireObject(questDomain['quests'], `${path}.quests`);
  for (const questId of Object.keys(quests)) {
    const state = requireObject(quests[questId], `${path}.quests.${questId}`);
    requireExactKeys(state, QUEST_STATE_KEYS, `${path}.quests.${questId}`);
    requireString(state['questId'], `${path}.quests.${questId}.questId`);
    const status = state['status'];
    if (typeof status !== 'string' || !QUEST_STATUSES.has(status))
      fail('corrupt-shape', `${path}.quests.${questId}.status invalid`);
    const objectives = requireObject(state['objectives'], `${path}.quests.${questId}.objectives`);
    for (const objectiveId of Object.keys(objectives)) {
      const o = requireObject(
        objectives[objectiveId],
        `${path}.quests.${questId}.objectives.${objectiveId}`
      );
      requireExactKeys(o, OBJECTIVE_KEYS, `${path}.quests.${questId}.objectives.${objectiveId}`);
      requireString(
        o['objectiveId'],
        `${path}.quests.${questId}.objectives.${objectiveId}.objectiveId`
      );
      if (typeof o['complete'] !== 'boolean')
        fail(
          'corrupt-shape',
          `${path}.quests.${questId}.objectives.${objectiveId}.complete must be boolean`
        );
      requireStringArray(
        o['matchedKeys'],
        `${path}.quests.${questId}.objectives.${objectiveId}.matchedKeys`
      );
    }
    requireStringArray(state['processedEventIds'], `${path}.quests.${questId}.processedEventIds`);
    requireNonNegativeInteger(
      state['nextTransitionOrdinal'],
      `${path}.quests.${questId}.nextTransitionOrdinal`
    );
    const history = state['history'];
    if (!Array.isArray(history))
      fail('corrupt-shape', `${path}.quests.${questId}.history must be an array`);
    history.forEach((entry, index) => {
      const e = requireObject(entry, `${path}.quests.${questId}.history[${String(index)}]`);
      requireExactKeys(
        e,
        QUEST_HISTORY_ALLOWED,
        `${path}.quests.${questId}.history[${String(index)}]`
      );
      const kind = e['kind'];
      if (typeof kind !== 'string' || !QUEST_TRANSITION_KINDS.has(kind)) {
        fail('corrupt-shape', `${path}.quests.${questId}.history[${String(index)}].kind invalid`);
      }
      requireString(e['questId'], `${path}.quests.${questId}.history[${String(index)}].questId`);
      requireString(
        e['transitionId'],
        `${path}.quests.${questId}.history[${String(index)}].transitionId`
      );
      requireNonNegativeInteger(
        e['seq'],
        `${path}.quests.${questId}.history[${String(index)}].seq`
      );
      if (e['resolution'] !== undefined) {
        const res = requireObject(
          e['resolution'],
          `${path}.quests.${questId}.history[${String(index)}].resolution`
        );
        requireExactKeys(
          res,
          new Set(['onAllRequiredComplete']),
          `${path}.quests.${questId}.history[${String(index)}].resolution`
        );
        const outcome = res['onAllRequiredComplete'];
        if (typeof outcome !== 'string' || !RESOLUTIONS.has(outcome)) {
          fail(
            'corrupt-shape',
            `${path}.quests.${questId}.history[${String(index)}].resolution.onAllRequiredComplete invalid`
          );
        }
      }
      if (e['objectiveIds'] !== undefined) {
        requireStringArray(
          e['objectiveIds'],
          `${path}.quests.${questId}.history[${String(index)}].objectiveIds`
        );
      }
    });
  }
}

/** Strict v1 payload guard. Unknown keys at any level are rejected. */
export function validatePayloadForVersion(
  payload: unknown,
  _schemaVersion: number
): asserts payload is SavePayload {
  const record = requireObject(payload, 'payload');
  requireExactKeys(record, HEADER_KEYS, 'payload');
  requireString(record['activeChapterId'], 'payload.activeChapterId');
  requireString(record['activeSceneId'], 'payload.activeSceneId');
  validateCheckpoint(record['checkpoint'], 'payload.checkpoint');
  const playtimeMinutes = record['playtimeMinutes'];
  if (
    typeof playtimeMinutes !== 'number' ||
    !Number.isFinite(playtimeMinutes) ||
    playtimeMinutes < 0
  ) {
    fail('corrupt-shape', 'payload.playtimeMinutes must be a non-negative number');
  }
  const domain = requireObject(record['domain'], 'payload.domain');
  requireExactKeys(domain, new Set(['dialogue', 'quest']), 'payload.domain');
  validateDialogue(domain['dialogue'], 'payload.domain.dialogue');
  validateQuest(domain['quest'], 'payload.domain.quest');
}

const EXPLORATION_KEYS: ReadonlySet<string> = new Set(['sceneId', 'position', 'visitedScenes']);
const POSITION_KEYS: ReadonlySet<string> = new Set(['x', 'y']);

function requireGridCoordinate(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail('corrupt-shape', `${path} must be a non-negative integer`);
  }
  return value;
}

function validateExploration(value: unknown, path: string): void {
  const exploration = requireObject(value, path);
  requireExactKeys(exploration, EXPLORATION_KEYS, path);
  requireString(exploration['sceneId'], `${path}.sceneId`);
  const position = requireObject(exploration['position'], `${path}.position`);
  requireExactKeys(position, POSITION_KEYS, `${path}.position`);
  requireGridCoordinate(position['x'], `${path}.position.x`);
  requireGridCoordinate(position['y'], `${path}.position.y`);
  const visited = exploration['visitedScenes'];
  if (
    !Array.isArray(visited) ||
    !visited.every((item) => typeof item === 'string') ||
    !visited.includes(exploration['sceneId'] as string)
  ) {
    fail('corrupt-shape', `${path}.visitedScenes must be string array including the active scene`);
  }
}

/**
 * Strict v2 payload guard: v1 shape PLUS `domain.exploration`, and a single
 * authoritative scene interpretation — `activeSceneId` must equal
 * `exploration.sceneId`. Contradictory states are rejected, never silently
 * resolved.
 */
export function validatePayloadV2(payload: unknown): asserts payload is SavePayload {
  const record = requireObject(payload, 'payload');
  requireExactKeys(record, HEADER_KEYS, 'payload');
  requireString(record['activeChapterId'], 'payload.activeChapterId');
  requireString(record['activeSceneId'], 'payload.activeSceneId');
  validateCheckpoint(record['checkpoint'], 'payload.checkpoint');
  const playtimeMinutes = record['playtimeMinutes'];
  if (
    typeof playtimeMinutes !== 'number' ||
    !Number.isFinite(playtimeMinutes) ||
    playtimeMinutes < 0
  ) {
    fail('corrupt-shape', 'payload.playtimeMinutes must be a non-negative number');
  }
  const domain = requireObject(record['domain'], 'payload.domain');
  requireExactKeys(domain, new Set(['dialogue', 'quest', 'exploration']), 'payload.domain');
  validateDialogue(domain['dialogue'], 'payload.domain.dialogue');
  validateQuest(domain['quest'], 'payload.domain.quest');
  validateExploration(domain['exploration'], 'payload.domain.exploration');

  const activeSceneId = record['activeSceneId'] as string;
  const explorationSceneId = (domain['exploration'] as { sceneId: string }).sceneId;
  if (activeSceneId !== explorationSceneId) {
    fail(
      'corrupt-shape',
      `payload.activeSceneId "${activeSceneId}" contradicts exploration.sceneId "${explorationSceneId}"`
    );
  }
}

// --- Progression guard (schema v3, WO-020 / FS-PROG-001) ---------------------

const ATTRIBUTE_IDS: ReadonlySet<string> = new Set(['intellect', 'perception', 'will']);
const PROGRESSION_PC_KEYS: ReadonlySet<string> = new Set([
  'pcId',
  'level',
  'xp',
  'attributes',
  'creditedOccurrences',
]);
const PROGRESSION_ARCHIVE_KEYS: ReadonlySet<string> = new Set(['discoverableCount', 'lifetime']);

function validateProgression(value: unknown, path: string): void {
  const progression = requireObject(value, path);
  requireExactKeys(progression, new Set(['pcs', 'archive']), path);

  const pcs = requireObject(progression['pcs'], `${path}.pcs`);
  for (const pcId of Object.keys(pcs)) {
    const pc = requireObject(pcs[pcId], `${path}.pcs.${pcId}`);
    requireExactKeys(pc, PROGRESSION_PC_KEYS, `${path}.pcs.${pcId}`);
    const storedPcId = requireString(pc['pcId'], `${path}.pcs.${pcId}.pcId`);
    if (storedPcId !== pcId) {
      fail('corrupt-shape', `${path}.pcs.${pcId}.pcId must equal its map key`);
    }
    const level = pc['level'];
    if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 20) {
      fail('corrupt-shape', `${path}.pcs.${pcId}.level must be an integer in 1..20`);
    }
    const xp = pc['xp'];
    if (typeof xp !== 'number' || !Number.isInteger(xp) || xp < 0) {
      fail('corrupt-shape', `${path}.pcs.${pcId}.xp must be a non-negative integer`);
    }
    const attributes = requireObject(pc['attributes'], `${path}.pcs.${pcId}.attributes`);
    requireExactKeys(attributes, ATTRIBUTE_IDS, `${path}.pcs.${pcId}.attributes`);
    for (const ab of Object.keys(attributes)) {
      const v = attributes[ab];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        fail(
          'corrupt-shape',
          `${path}.pcs.${pcId}.attributes.${ab} must be a non-negative integer`
        );
      }
    }
    requireStringArray(pc['creditedOccurrences'], `${path}.pcs.${pcId}.creditedOccurrences`);
  }

  const archive = requireObject(progression['archive'], `${path}.archive`);
  requireExactKeys(archive, PROGRESSION_ARCHIVE_KEYS, `${path}.archive`);
  requireNonNegativeInteger(archive['discoverableCount'], `${path}.archive.discoverableCount`);
  const lifetime = requireObject(archive['lifetime'], `${path}.archive.lifetime`);
  for (const key of Object.keys(lifetime)) {
    requireNonNegativeInteger(lifetime[key], `${path}.archive.lifetime.${key}`);
  }
}

/**
 * Strict v3 payload guard: v2 shape PLUS `domain.progression`. Progression is
 * canonical continuation state; the guard enforces its shape, attribute-key
 * whitelist, per-PC key identity, and value ranges.
 */
export function validatePayloadV3(payload: unknown): asserts payload is SavePayload {
  const record = requireObject(payload, 'payload');
  requireExactKeys(record, HEADER_KEYS, 'payload');
  requireString(record['activeChapterId'], 'payload.activeChapterId');
  requireString(record['activeSceneId'], 'payload.activeSceneId');
  validateCheckpoint(record['checkpoint'], 'payload.checkpoint');
  const playtimeMinutes = record['playtimeMinutes'];
  if (
    typeof playtimeMinutes !== 'number' ||
    !Number.isFinite(playtimeMinutes) ||
    playtimeMinutes < 0
  ) {
    fail('corrupt-shape', 'payload.playtimeMinutes must be a non-negative number');
  }
  const domain = requireObject(record['domain'], 'payload.domain');
  requireExactKeys(
    domain,
    new Set(['dialogue', 'quest', 'exploration', 'progression']),
    'payload.domain'
  );
  validateDialogue(domain['dialogue'], 'payload.domain.dialogue');
  validateQuest(domain['quest'], 'payload.domain.quest');
  validateExploration(domain['exploration'], 'payload.domain.exploration');
  validateProgression(domain['progression'], 'payload.domain.progression');

  const activeSceneId = record['activeSceneId'] as string;
  const explorationSceneId = (domain['exploration'] as { sceneId: string }).sceneId;
  if (activeSceneId !== explorationSceneId) {
    fail(
      'corrupt-shape',
      `payload.activeSceneId "${activeSceneId}" contradicts exploration.sceneId "${explorationSceneId}"`
    );
  }
}

// --- Skills guard (schema v4, WO-021 / FS-SKILL-001) ------------------------

const SKILL_PC_KEYS: ReadonlySet<string> = new Set(['pcId', 'values', 'learnLedger']);

function validateSkills(value: unknown, path: string): void {
  const skills = requireObject(value, path);
  requireExactKeys(skills, new Set(['pcs']), path);
  const pcs = requireObject(skills['pcs'], `${path}.pcs`);
  for (const pcId of Object.keys(pcs)) {
    const pc = requireObject(pcs[pcId], `${path}.pcs.${pcId}`);
    requireExactKeys(pc, SKILL_PC_KEYS, `${path}.pcs.${pcId}`);
    const storedPcId = requireString(pc['pcId'], `${path}.pcs.${pcId}.pcId`);
    if (storedPcId !== pcId) {
      fail('corrupt-shape', `${path}.pcs.${pcId}.pcId must equal its map key`);
    }
    const values = requireObject(pc['values'], `${path}.pcs.${pcId}.values`);
    for (const skillId of Object.keys(values)) {
      if (!isCanonicalSkill(skillId)) {
        fail('corrupt-shape', `${path}.pcs.${pcId}.values has non-canonical skill "${skillId}"`);
      }
      const v = values[skillId];
      if (v !== 0 && v !== 1) {
        fail('corrupt-shape', `${path}.pcs.${pcId}.values.${skillId} must be exactly 0 or 1`);
      }
    }
    requireStringArray(pc['learnLedger'], `${path}.pcs.${pcId}.learnLedger`);
  }
}

/**
 * Strict v4 payload guard: v3 shape PLUS `domain.skills`. Skills is canonical
 * continuation state; the guard enforces its shape, canonical 20-skill key
 * membership (content-independent — from the pure domain catalog via
 * `isCanonicalSkill`, never the content pipeline), exactly-0|1 values, per-PC
 * key identity, and the ledger string shape.
 */
export function validatePayloadV4(payload: unknown): asserts payload is SavePayload {
  const record = requireObject(payload, 'payload');
  requireExactKeys(record, HEADER_KEYS, 'payload');
  requireString(record['activeChapterId'], 'payload.activeChapterId');
  requireString(record['activeSceneId'], 'payload.activeSceneId');
  validateCheckpoint(record['checkpoint'], 'payload.checkpoint');
  const playtimeMinutes = record['playtimeMinutes'];
  if (
    typeof playtimeMinutes !== 'number' ||
    !Number.isFinite(playtimeMinutes) ||
    playtimeMinutes < 0
  ) {
    fail('corrupt-shape', 'payload.playtimeMinutes must be a non-negative number');
  }
  const domain = requireObject(record['domain'], 'payload.domain');
  requireExactKeys(
    domain,
    new Set(['dialogue', 'quest', 'exploration', 'progression', 'skills']),
    'payload.domain'
  );
  validateDialogue(domain['dialogue'], 'payload.domain.dialogue');
  validateQuest(domain['quest'], 'payload.domain.quest');
  validateExploration(domain['exploration'], 'payload.domain.exploration');
  validateProgression(domain['progression'], 'payload.domain.progression');
  validateSkills(domain['skills'], 'payload.domain.skills');

  const activeSceneId = record['activeSceneId'] as string;
  const explorationSceneId = (domain['exploration'] as { sceneId: string }).sceneId;
  if (activeSceneId !== explorationSceneId) {
    fail(
      'corrupt-shape',
      `payload.activeSceneId "${activeSceneId}" contradicts exploration.sceneId "${explorationSceneId}"`
    );
  }
}

// --- Inventory guard (schema v5, WO-022 / FS-INV-001) -----------------------

const INVENTORY_KEYS: ReadonlySet<string> = new Set(['items', 'equipped', 'ledger']);
/* Stack keys may optionally carry a content-resolved quest-protection flag */
const ITEM_STACK_KEYS: ReadonlySet<string> = new Set(['itemId', 'count', 'questProtected']);
const EQUIP_SLOTS: ReadonlySet<string> = new Set(EQUIPMENT_SLOTS);
const LEDGER_ENTRY_PATTERN = /^(grant|remove|force-remove):[^:]+:[^:]+$/;

function validateInventory(value: unknown, path: string): void {
  const inventory = requireObject(value, path);
  requireExactKeys(inventory, INVENTORY_KEYS, path);

  const items = requireObject(inventory['items'], `${path}.items`);
  for (const itemId of Object.keys(items)) {
    if (!isContentIdSyntax('item', itemId)) {
      fail('corrupt-shape', `${path}.items has invalid item id grammar "${itemId}"`);
    }
    const stack = requireObject(items[itemId], `${path}.items.${itemId}`);
    requireExactKeys(stack, ITEM_STACK_KEYS, `${path}.items.${itemId}`);
    const storedId = requireString(stack['itemId'], `${path}.items.${itemId}.itemId`);
    if (storedId !== itemId) {
      fail('corrupt-shape', `${path}.items.${itemId}.itemId must equal its map key`);
    }
    const count = stack['count'];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      fail('corrupt-shape', `${path}.items.${itemId}.count must be a positive integer`);
    }
    if (stack['questProtected'] !== undefined && typeof stack['questProtected'] !== 'boolean') {
      fail('corrupt-shape', `${path}.items.${itemId}.questProtected must be a boolean`);
    }
  }

  const equipped = requireObject(inventory['equipped'], `${path}.equipped`);
  for (const slot of Object.keys(equipped)) {
    if (!EQUIP_SLOTS.has(slot)) {
      fail('corrupt-shape', `${path}.equipped has non-canonical slot "${slot}"`);
    }
    const itemId = requireString(equipped[slot], `${path}.equipped.${slot}`);
    if (!isContentIdSyntax('item', itemId) || items[itemId] === undefined) {
      fail('corrupt-shape', `${path}.equipped.${slot} references an unowned/invalid item`);
    }
  }

  const ledger = inventory['ledger'];
  if (!Array.isArray(ledger)) fail('corrupt-shape', `${path}.ledger must be an array`);
  ledger.forEach((entry, index) => {
    if (typeof entry !== 'string' || !LEDGER_ENTRY_PATTERN.test(entry)) {
      fail('corrupt-shape', `${path}.ledger[${String(index)}] has invalid ledger entry`);
    }
  });
}

const DOMAIN_KEYS_V5: ReadonlySet<string> = new Set([
  'dialogue',
  'quest',
  'exploration',
  'progression',
  'skills',
  'inventory',
]);

/**
 * Strict v5 payload guard: v4 shape PLUS `domain.inventory`. Inventory is
 * canonical continuation state; the guard enforces envelope shape, positive
 * integer stack counts, key identity, item-id grammar (content-independent via
 * the ID syntax helper), canonical equipment slots, equipped-implies-owned, and
 * the generalized ledger entry grammar.
 */
export function validatePayloadV5(payload: unknown): asserts payload is SavePayload {
  const record = requireObject(payload, 'payload');
  requireExactKeys(record, HEADER_KEYS, 'payload');
  requireString(record['activeChapterId'], 'payload.activeChapterId');
  requireString(record['activeSceneId'], 'payload.activeSceneId');
  validateCheckpoint(record['checkpoint'], 'payload.checkpoint');
  const playtimeMinutes = record['playtimeMinutes'];
  if (
    typeof playtimeMinutes !== 'number' ||
    !Number.isFinite(playtimeMinutes) ||
    playtimeMinutes < 0
  ) {
    fail('corrupt-shape', 'payload.playtimeMinutes must be a non-negative number');
  }
  const domain = requireObject(record['domain'], 'payload.domain');
  requireExactKeys(domain, DOMAIN_KEYS_V5, 'payload.domain');
  validateDialogue(domain['dialogue'], 'payload.domain.dialogue');
  validateQuest(domain['quest'], 'payload.domain.quest');
  validateExploration(domain['exploration'], 'payload.domain.exploration');
  validateProgression(domain['progression'], 'payload.domain.progression');
  validateSkills(domain['skills'], 'payload.domain.skills');
  validateInventory(domain['inventory'], 'payload.domain.inventory');

  const activeSceneId = record['activeSceneId'] as string;
  const explorationSceneId = (domain['exploration'] as { sceneId: string }).sceneId;
  if (activeSceneId !== explorationSceneId) {
    fail(
      'corrupt-shape',
      `payload.activeSceneId "${activeSceneId}" contradicts exploration.sceneId "${explorationSceneId}"`
    );
  }
}

/**
 * Dispatch a payload to its version-specific strict guard. Keeps v1 exact; v2
 * adds exploration with cross-field integrity; v3 additionally adds progression;
 * v4 additionally adds skills; v5 additionally adds inventory.
 */
export function validatePayload(version: number, payload: unknown): asserts payload is SavePayload {
  if (version === 1) {
    validatePayloadForVersion(payload, 1);
    return;
  }
  if (version === 2) {
    validatePayloadV2(payload);
    return;
  }
  if (version === 3) {
    validatePayloadV3(payload);
    return;
  }
  if (version === 4) {
    validatePayloadV4(payload);
    return;
  }
  if (version === 5) {
    validatePayloadV5(payload);
    return;
  }
  fail('corrupt-shape', `no validator registered for schema version ${String(version)}`);
}
