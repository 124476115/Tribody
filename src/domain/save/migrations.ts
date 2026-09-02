/**
 * Save System — schema migration (FS-SAVE-001)
 *
 * Pure TypeScript. The PRODUCTION registry ships steps only for real persisted
 * formats. v1 is the initial format (dialogue + quest only); v2 (WO-014) adds
 * `domain.exploration`. Sequential-migration behavior — exact s -> s+1 -> ... ->
 * target order, no jumps, no skipped steps, purity — is proven against an
 * INJECTED registry in tests AND (from v2) against the production registry.
 */
import type { ExplorationSavedState } from '../exploration';
import type { ProgressionSavedState } from '../progression';
import type { SkillsSavedState } from '../skills';
import { createInventoryState, type InventorySavedState } from '../inventory';
import { fail } from './errors';
import type { MigrationRegistry, MigrationResult, SavePayload } from './types';

/**
 * v1 -> v2: add the exploration domain owned by WO-014.
 *
 * A v1 snapshot never stored an exact player position, so we MUST NOT invent
 * coordinates. The migration resumes at the persisted active scene via the
 * deterministic legacy/default entry rule: sceneId = activeSceneId, at the
 * spawn/entry position, with that scene marked visited. It depends only on data
 * already present in the v1 snapshot (no Phaser, browser, or content lookups).
 */
function migrateV1ToV2(payload: SavePayload): SavePayload {
  const source = payload.domain as unknown as { exploration?: unknown };
  if (source.exploration !== undefined) {
    // Defensive: a v1 payload should not already carry exploration; if somehow
    // present in a correct shape we preserve it, otherwise fall through.
    fail('corrupt-shape', 'unexpected exploration field in v1 snapshot');
  }
  const activeSceneId = payload.activeSceneId;
  const exploration: ExplorationSavedState = {
    sceneId: activeSceneId,
    position: { x: 0, y: 0 },
    visitedScenes: [activeSceneId],
  };
  const domain = { ...payload.domain, exploration };
  return { ...payload, domain: domain as SavePayload['domain'] };
}

/**
 * v2 -> v3: add the progression domain owned by WO-020.
 *
 * A v2 snapshot legitimately has no progression history, so this seeds canonical
 * INITIAL state: an EMPTY `pcs` map (no fabricated/derived PC list) and the
 * canonical archive. It is PURE and CONTENT-INDEPENDENT — it never reads the
 * content catalog and never derives XP/level from dialogue/quest/exploration
 * data (that would fabricate progression history). PCs are introduced later by
 * `activatePc` on first play.
 */
function migrateV2ToV3(payload: SavePayload): SavePayload {
  const source = payload.domain as unknown as { progression?: unknown };
  if (source.progression !== undefined) {
    fail('corrupt-shape', 'unexpected progression field in v2 snapshot');
  }
  const progression: ProgressionSavedState = {
    pcs: {},
    archive: { discoverableCount: 0, lifetime: {} },
  };
  const domain = { ...payload.domain, progression };
  return { ...payload, domain: domain as SavePayload['domain'] };
}

/**
 * v3 -> v4: add the skills domain owned by WO-021.
 *
 * A v3 snapshot legitimately has no skills, so this seeds canonical INITIAL
 * state: an EMPTY `pcs` map (no fabricated/derived PC skill lists). It is PURE
 * and CONTENT-INDEPENDENT — it never reads the content catalog and never derives
 * skill state from dialogue/quest/exploration/progression data. PCs appear later
 * through `learnSkill`.
 */
function migrateV3ToV4(payload: SavePayload): SavePayload {
  const source = payload.domain as unknown as { skills?: unknown };
  if (source.skills !== undefined) {
    fail('corrupt-shape', 'unexpected skills field in v3 snapshot');
  }
  const skills: SkillsSavedState = { pcs: {} };
  const domain = { ...payload.domain, skills };
  return { ...payload, domain: domain as SavePayload['domain'] };
}

/**
 * v4 -> v5: add the inventory domain owned by WO-022.
 *
 * A v4 snapshot legitimately has no inventory, so this seeds canonical INITIAL
 * state: canonical empty `items`/`equipped` envelopes and an empty generalized
 * mutation ledger. It is PURE and CONTENT-INDEPENDENT — it never reads the
 * content catalog and never fabricates grants/equipment from dialogue/quest/
 * exploration/progression/skills data. Items appear later through labelled
 * effect occurrences via the application executor.
 */
function migrateV4ToV5(payload: SavePayload): SavePayload {
  const source = payload.domain as unknown as { inventory?: unknown };
  if (source.inventory !== undefined) {
    fail('corrupt-shape', 'unexpected inventory field in v4 snapshot');
  }
  const inventory: InventorySavedState = createInventoryState();
  const domain = { ...payload.domain, inventory };
  return { ...payload, domain: domain as SavePayload['domain'] };
}

/** Production migration registry. Real v1->v2 .. v4->v5 steps. */
export const Migrations: MigrationRegistry = Object.freeze({
  2: migrateV1ToV2,
  3: migrateV2ToV3,
  4: migrateV3ToV4,
  5: migrateV4ToV5,
});

function ensureStep(
  registry: MigrationRegistry,
  version: number
): (payload: SavePayload) => unknown {
  const step = registry[version];
  if (step === undefined) {
    fail('missing-migration', `no migration step producing v${String(version)} is registered`);
  }
  return step;
}

/**
 * Migrate a payload from `from` to `to` by applying each sequential step once.
 * Never mutates the input payload. Returns the migrated payload (recast) and
 * the list of applied versions.
 */
export function applyMigrations(
  registry: MigrationRegistry,
  from: number,
  to: number,
  payload: SavePayload
): MigrationResult {
  if (!Number.isInteger(from) || from < 1) fail('corrupt-shape', 'migration start version invalid');
  if (!Number.isInteger(to) || to < 1) fail('corrupt-shape', 'migration target version invalid');
  if (from > to)
    fail('corrupt-shape', `migration target ${String(to)} older than source ${String(from)}`);

  const applied: number[] = [];
  let current: unknown = payload;
  for (let version = from; version < to; version += 1) {
    const step = ensureStep(registry, version + 1);
    current = step(current as SavePayload);
    applied.push(version + 1);
  }
  return { payload: (current ?? undefined) as SavePayload, applied };
}
