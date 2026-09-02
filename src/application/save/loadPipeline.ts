/**
 * Save System — shared load pipeline (FS-SAVE-001)
 *
 * The single staging path used by loadSlot, import, and (from target-version
 * policy) nothing else:
 *
 *   parse -> header shape (forward-compatible) -> checksum -> version-specific
 *   strict payload validation -> sequential migration -> latest validation ->
 *   content compatibility -> hydrate -> record finalized for persist.
 *
 * Ordering is load-bearing:
 * - A checksum-verified but NEWER schema is `unsupported-schema`, never
 *   corruption.
 * - An unverified header (e.g. a flipped schemaVersion) stays `corrupt-checksum`.
 * - Version-specific strictness runs only AFTER the checksum.
 */
import {
  parseJSON,
  extractHeader,
  extractHeaderExtras,
  validatePayload,
  applyMigrations,
  Migrations,
  SaveError,
  type SavePayload,
  type MigrationRegistry,
  type SaveRecord,
} from '../../domain/save';
import { recordBodyText, finalizeRecord } from './recordBuild';
import { checkContentVersion, assertContinuationRefs } from './contentCompatibility';
import type { Checksummer, ContentCatalog } from './ports';
import type { DialogueSavedState } from '../../domain/dialogue';
import type { QuestSavedState } from '../../domain/quest';
import type { ExplorationSavedState } from '../../domain/exploration';
import type { ProgressionSavedState } from '../../domain/progression';
import type { SkillsSavedState } from '../../domain/skills';
import type { InventorySavedState } from '../../domain/inventory';

/**
 * Version-specific payload validation. Throws a typed SaveError (corrupt-shape)
 * on failure. Runs at the RECORDED version before migration and at the TARGET
 * version after migration.
 */
export type PipelineGuard = (payload: unknown) => void;

export interface PipelineOptions {
  checksummer: Checksummer;
  catalog: ContentCatalog;
  compatMap?: ReadonlyMap<string, readonly string[]>;
  migrations?: MigrationRegistry;
  guards?: Partial<Record<number, PipelineGuard>>;
  target?: number;
  maxSerializedBytes?: number;
}

export interface LoadedRecord {
  record: SaveRecord;
  runtime: {
    dialogue: DialogueSavedState;
    quest: QuestSavedState;
    exploration: ExplorationSavedState;
    progression: ProgressionSavedState;
    skills: SkillsSavedState;
    inventory: InventorySavedState;
  };
  applied: number[];
}

function guardFor(
  version: number,
  guards: Partial<Record<number, PipelineGuard>> | undefined,
  _target: number
): PipelineGuard {
  const custom = guards?.[version];
  if (custom !== undefined) return custom;
  return (payload: unknown) => {
    validatePayload(version, payload);
  };
}

export async function loadRecord(raw: string, options: PipelineOptions): Promise<LoadedRecord> {
  const target = options.target ?? 1;
  const parsed = parseJSON(raw);

  const header = extractHeader(parsed);
  const extras = extractHeaderExtras(parsed);

  // Stage 3 — checksum over the FROZEN body (forward-compatible: ignores
  // unknown top-level fields).
  const bodyText = recordBodyText({
    schemaVersion: header.schemaVersion,
    contentVersion: extras.contentVersion,
    gameVersion: extras.gameVersion,
    createdAt: extras.createdAt,
    payload: header.payload as SavePayload,
  });
  const actual = await options.checksummer.checksum(bodyText);
  if (actual !== header.checksum) {
    throw new SaveError('corrupt-checksum', 'checksum mismatch');
  }

  // Stage 4 — version verdict before any strict payload validation.
  if (header.schemaVersion > target) {
    throw new SaveError(
      'unsupported-schema',
      `record schema v${String(header.schemaVersion)} is newer than supported v${String(target)}`
    );
  }

  // Stage 5 — strict validation at the recorded version.
  guardFor(header.schemaVersion, options.guards, target)(header.payload);

  // Stage 6 — sequential migration.
  const migrated = applyMigrations(
    options.migrations ?? Migrations,
    header.schemaVersion,
    target,
    header.payload as SavePayload
  );

  // Stage 7 — latest validation at the target version.
  if (target !== header.schemaVersion) {
    guardFor(target, options.guards, target)(migrated.payload);
  }

  // Stage 8 — content compatibility against the CURRENT catalog.
  checkContentVersion(extras.contentVersion, options.catalog, options.compatMap);
  assertContinuationRefs(migrated.payload, options.catalog);

  // Stage 9 — hydrate + re-finalize for persistence (new checksum if migrated).
  const record = await finalizeRecord(options.checksummer, {
    schemaVersion: target,
    contentVersion: extras.contentVersion,
    gameVersion: extras.gameVersion,
    createdAt: extras.createdAt,
    payload: migrated.payload,
  });

  return {
    record,
    runtime: {
      dialogue: migrated.payload.domain.dialogue,
      quest: migrated.payload.domain.quest,
      exploration: migrated.payload.domain.exploration,
      progression: migrated.payload.domain.progression,
      skills: migrated.payload.domain.skills,
      inventory: migrated.payload.domain.inventory,
    },
    applied: migrated.applied,
  };
}
