/**
 * Save System — application ports (FS-SAVE-001)
 *
 * The persistence boundary. Records are create-only and immutable; slot
 * pointer docs are the only mutable state. Nothing else in the pipeline talks
 * to storage directly.
 *
 * Tell-tale contract: object keys live under application/save; adapters map
 * errors to the taxonomy (persistence-error / persistence-quota /
 * persistence-collision).
 */
import type { SaveRecord, SaveSlotDoc, SaveSlotId } from '../../domain/save';

export interface PersistencePort {
  /** Create a record. Add-only semantics: an existing recordId must fail typed. */
  createRecord(recordId: string, record: SaveRecord): Promise<void>;

  getRecord(recordId: string): Promise<SaveRecord | null>;

  deleteRecord(recordId: string): Promise<void>;

  listRecordIds(): Promise<string[]>;

  listSlots(): Promise<SaveSlotDoc[]>;

  getSlot(slotId: SaveSlotId): Promise<SaveSlotDoc | null>;

  putSlot(doc: SaveSlotDoc): Promise<void>;

  deleteSlot(slotId: SaveSlotId): Promise<void>;
}

/** Async hash function for the frozen checksum body. */
export interface Checksummer {
  checksum(text: string): Promise<string>;
}

export interface Clock {
  now(): number;
}

/**
 * Content catalog required for continuation-critical validation on load/import
 * and for build/import content-version checks. Only stable ids participate.
 */
export interface ContentCatalog {
  contentVersion: string;
  chapters: Record<string, { entrySceneId: string }>;
  scenes: Record<string, { chapterId: string }>;
  dialogues: Record<string, { entryNode: string }>;
  nodes: Record<string, Record<string, { choices: { id: string; skillCheck?: unknown }[] }>>;
  quests: Record<string, { objectiveIds: string[] }>;
  /**
   * Item contract required for load-time inventory/equipment content
   * compatibility (FS-INV-001): authored slot, stackability, and quest
   * protection. Only stable ids participate.
   */
  items: Record<string, { slot?: string; stackable: boolean; questProtected: boolean }>;
}
