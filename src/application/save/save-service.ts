/**
 * Save System — SaveService (FS-SAVE-001)
 *
 * The semantic surface for save/load/import/export. Emits only typed results
 * (SaveError codes) and only typed warnings; never bare throws across the
 * boundary. Owns record-id generation (immutability), slot rotation policy,
 * the size cap, and the best-effort migration persist on load.
 */
import {
  isSaveSlotId,
  SaveError,
  stringifyCanonical,
  validatePayload,
  MAX_SERIALIZED_SAVE_BYTES,
  SAVE_SCHEMA_VERSION,
  type SavePayload,
  type SaveRecord,
  type SaveSlotDoc,
  type SaveSlotId,
  type SaveSlotKind,
  type SaveWarning,
  type MigrationRegistry,
  Migrations,
} from '../../domain/save';
import { isAutoSlot, kindForSlot, pickAutosaveSlot } from './slotPolicy';
import { finalizeRecord, recordBodyText } from './recordBuild';
import { loadRecord, type PipelineGuard, type PipelineOptions } from './loadPipeline';
import { checkContentVersion, assertContinuationRefs } from './contentCompatibility';
import { bestEffortPutSlot, persistMigratedRecord, writeRecordAndSlot } from './atomicWrite';
import { serializeForExport } from './importExport';
import type { Checksummer, Clock, ContentCatalog, PersistencePort } from './ports';
import type { DialogueSavedState } from '../../domain/dialogue';
import type { QuestSavedState } from '../../domain/quest';
import type { ExplorationSavedState } from '../../domain/exploration';
import type { ProgressionSavedState } from '../../domain/progression';
import type { SkillsSavedState } from '../../domain/skills';
import type { InventorySavedState } from '../../domain/inventory';

export interface SaveContext {
  contentVersion: string;
  activeChapterId: string;
  activeSceneId: string;
  playtimeMinutes: number;
  checkpoint: SavePayload['checkpoint'];
}

export interface SaveDomain {
  dialogue: DialogueSavedState;
  quest: QuestSavedState;
  exploration: ExplorationSavedState;
  progression: ProgressionSavedState;
  skills: SkillsSavedState;
  inventory: InventorySavedState;
}

export type SaveResult =
  { status: 'ok'; slot: SaveSlotDoc } | { status: 'error'; error: SaveError };

export type LoadResult =
  | { status: 'ok'; runtime: SaveDomain; record: SaveRecord; warnings: SaveWarning[] }
  | { status: 'error'; error: SaveError };

export type ExportResult = { status: 'ok'; text: string } | { status: 'error'; error: SaveError };

export type ImportResult =
  { status: 'ok'; slot: SaveSlotDoc } | { status: 'error'; error: SaveError };

export type DeleteResult = { status: 'ok' } | { status: 'error'; error: SaveError };

export interface SaveServiceOptions {
  persistence: PersistencePort;
  checksummer: Checksummer;
  clock: Clock;
  catalog: ContentCatalog;
  compatMap?: ReadonlyMap<string, readonly string[]>;
  migrations?: MigrationRegistry;
  guards?: Partial<Record<number, PipelineGuard>>;
  target?: number;
  maxSerializedBytes?: number;
  gameVersion?: string;
}

function toResult(error: unknown): { status: 'error'; error: SaveError } {
  if (error instanceof SaveError) return { status: 'error', error };
  return { status: 'error', error: new SaveError('persistence-error', String(error)) };
}

export class SaveService {
  readonly persistence: PersistencePort;
  private readonly checksummer: Checksummer;
  private readonly clock: Clock;
  private readonly catalog: ContentCatalog;
  private readonly compatMap: ReadonlyMap<string, readonly string[]>;
  private readonly migrations: MigrationRegistry;
  private readonly guards: Partial<Record<number, PipelineGuard>> | undefined;
  private readonly target: number;
  private readonly maxSerializedBytes: number;
  private readonly gameVersion: string;
  private recordSeq = 0;

  constructor(options: SaveServiceOptions) {
    this.persistence = options.persistence;
    this.checksummer = options.checksummer;
    this.clock = options.clock;
    this.catalog = options.catalog;
    this.compatMap = options.compatMap ?? new Map();
    this.migrations = options.migrations ?? Migrations;
    this.guards = options.guards;
    this.target = options.target ?? SAVE_SCHEMA_VERSION;
    this.maxSerializedBytes = options.maxSerializedBytes ?? MAX_SERIALIZED_SAVE_BYTES;
    this.gameVersion = options.gameVersion ?? '0.0.1';
  }

  private nextRecordId(): string {
    this.recordSeq += 1;
    return `${String(this.clock.now())}.${String(this.recordSeq)}`;
  }

  private pipelineGuardOptions(): PipelineOptions {
    const base: PipelineOptions = {
      checksummer: this.checksummer,
      catalog: this.catalog,
      compatMap: this.compatMap,
      migrations: this.migrations,
      target: this.target,
    };
    if (this.guards === undefined) return base;
    return { ...base, guards: this.guards };
  }

  async listSlots(): Promise<SaveSlotDoc[]> {
    return this.persistence.listSlots();
  }

  async saveToSlot(slotId: SaveSlotId, runtime: SaveDomain, ctx: SaveContext): Promise<SaveResult> {
    if (!isSaveSlotId(slotId)) {
      return toResult(new SaveError('slot-not-found', `unknown slot id "${String(slotId)}"`));
    }
    const payload: SavePayload = {
      activeChapterId: ctx.activeChapterId,
      activeSceneId: ctx.activeSceneId,
      checkpoint: ctx.checkpoint,
      playtimeMinutes: ctx.playtimeMinutes,
      domain: runtime,
    };
    try {
      validatePayload(this.target, payload);
      checkContentVersion(ctx.contentVersion, this.catalog, this.compatMap);
      assertContinuationRefs(payload, this.catalog);
    } catch (error) {
      return toResult(error);
    }

    const now = this.clock.now();
    const kind: SaveSlotKind = kindForSlot(slotId);
    let destSlotId = slotId;
    if (isAutoSlot(slotId)) {
      destSlotId = pickAutosaveSlot(await this.persistence.listSlots());
    }

    const body = {
      schemaVersion: this.target,
      contentVersion: ctx.contentVersion,
      gameVersion: this.gameVersion,
      createdAt: now,
      payload,
    };
    if (recordBodyText(body).length > this.maxSerializedBytes) {
      return toResult(new SaveError('save-oversize', 'serialized save exceeds size cap'));
    }
    const record = await finalizeRecord(this.checksummer, body);
    const recordId = this.nextRecordId();
    const doc: SaveSlotDoc = {
      slotId: destSlotId,
      kind,
      recordId,
      updatedAt: now,
      loadIssue: null,
      meta: {},
    };
    try {
      await writeRecordAndSlot(this.persistence, recordId, record, doc);
      return { status: 'ok', slot: doc };
    } catch (error) {
      return toResult(error);
    }
  }

  async quickSave(runtime: SaveDomain, ctx: SaveContext): Promise<SaveResult> {
    return this.saveToSlot('quick', runtime, ctx);
  }

  async autosave(runtime: SaveDomain, ctx: SaveContext): Promise<SaveResult> {
    return this.saveToSlot('auto-1', runtime, ctx);
  }

  async loadSlot(slotId: SaveSlotId): Promise<LoadResult> {
    const slot = await this.persistence.getSlot(slotId);
    if (slot === null) {
      return toResult(new SaveError('slot-not-found', `no save in slot "${slotId}"`));
    }
    return this.loadSlotRecord(slot);
  }

  /**
   * Load the newest valid autosave (AC-03 corrupted-save fallback). Iterates
   * autosave slots in newest-first deterministic (updatedAt, slotId) order,
   * skipping corrupt and pre-marked-loadIssue slots until the first valid one;
   * returns its runtime. Never succeeds over nobody, and only ever returns a
   * typed error.
   */
  async loadBestAutosave(): Promise<LoadResult> {
    const candidates = (await this.persistence.listSlots())
      .filter((doc) => doc.kind === 'autosave')
      .sort((a, b) => a.updatedAt - b.updatedAt || a.slotId.localeCompare(b.slotId));
    for (const slot of [...candidates].reverse()) {
      if (slot.loadIssue !== null) continue;
      const probe = await this.loadSlotRecord(slot);
      if (probe.status === 'ok') return probe;
    }
    return toResult(new SaveError('slot-not-found', 'no valid autosave available'));
  }

  /**
   * Load one slot's referenced record through the full pipeline. On failure the
   * slot is marked with a best-effort `loadIssue` (pointer maintenance); the
   * load itself only returns typed results.
   */
  private async loadSlotRecord(slot: SaveSlotDoc): Promise<LoadResult> {
    const record = await this.persistence.getRecord(slot.recordId);
    if (record === null) {
      const error = new SaveError(
        'corrupt-shape',
        `slot "${slot.slotId}" references missing record "${slot.recordId}"`
      );
      await bestEffortPutSlot(this.persistence, {
        ...slot,
        loadIssue: { code: error.code, message: error.message },
      });
      return toResult(error);
    }

    try {
      const loaded = await loadRecord(stringifyCanonical(record), this.pipelineGuardOptions());
      const warnings: SaveWarning[] = [];
      if (loaded.applied.length > 0) {
        const persisted = await persistMigratedRecord(
          this.persistence,
          this.nextRecordId(),
          loaded.record,
          slot
        );
        if (!persisted.ok) {
          warnings.push({
            code: 'migration-record-not-persisted',
            message: `migrated record v${String(this.target)} could not be persisted back (${persisted.errorText})`,
          });
        }
      }
      return { status: 'ok', runtime: loaded.runtime, record: loaded.record, warnings };
    } catch (error) {
      const typed = toResult(error).error;
      await bestEffortPutSlot(this.persistence, {
        ...slot,
        loadIssue: { code: typed.code, message: typed.message },
      });
      return toResult(typed);
    }
  }

  async deleteSlot(slotId: SaveSlotId): Promise<DeleteResult> {
    const slot = await this.persistence.getSlot(slotId);
    if (slot === null) {
      return toResult(new SaveError('slot-not-found', `no save in slot "${slotId}"`));
    }
    try {
      await this.persistence.deleteSlot(slotId);
      return { status: 'ok' };
    } catch (error) {
      return toResult(error);
    }
  }

  async exportSave(slotId: SaveSlotId): Promise<ExportResult> {
    const slot = await this.persistence.getSlot(slotId);
    if (slot === null) {
      return toResult(new SaveError('slot-not-found', `no save in slot "${slotId}"`));
    }
    const record = await this.persistence.getRecord(slot.recordId);
    if (record === null) {
      return toResult(
        new SaveError(
          'corrupt-shape',
          `slot "${slotId}" references missing record "${slot.recordId}"`
        )
      );
    }
    const text = serializeForExport(record);
    if (text.length > this.maxSerializedBytes) {
      return toResult(new SaveError('save-oversize', 'serialized save exceeds size cap'));
    }
    return { status: 'ok', text };
  }

  async importSave(text: string, slotId: SaveSlotId): Promise<ImportResult> {
    if (text.length > this.maxSerializedBytes) {
      return toResult(new SaveError('import-oversize', 'import blob exceeds size cap'));
    }
    let loaded;
    try {
      loaded = await loadRecord(text, this.pipelineGuardOptions());
    } catch (error) {
      if (error instanceof SaveError) {
        if (error.code === 'corrupt-json' || error.code === 'corrupt-shape') {
          return toResult(new SaveError('import-malformed', error.message));
        }
        return toResult(error);
      }
      throw error;
    }

    const now = this.clock.now();
    const recordId = this.nextRecordId();
    const doc: SaveSlotDoc = {
      slotId,
      kind: kindForSlot(slotId),
      recordId,
      updatedAt: now,
      loadIssue: null,
      meta: {},
    };
    try {
      await writeRecordAndSlot(this.persistence, recordId, loaded.record, doc);
      return { status: 'ok', slot: doc };
    } catch (error) {
      return toResult(error);
    }
  }
}
