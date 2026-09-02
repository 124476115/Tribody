/**
 * Save System — atomic write helper (FS-SAVE-001)
 *
 * A save is two writes: create (immutable record) + putSlot (mutable pointer).
 * `writeRecordAndSlot` guarantees the pointer is only repointed AFTER the
 * record exists; on a failed pointer write the orphan record is deleted
 * best-effort so the previous pointer remains valid. Load-side pointer
 * maintenance (loadIssue markers, migrated-record repoint) is best-effort by
 * design and never fails a load.
 */
import { SaveError, type SaveRecord, type SaveSlotDoc } from '../../domain/save';
import type { PersistencePort } from './ports';

/**
 * Create + point. Rejects with the persistence error on pointer failure after
 * rolling back the just-created record (best effort). The reference `doc`
 * carries the caller's updatedAt/metadata.
 */
export async function writeRecordAndSlot(
  port: PersistencePort,
  recordId: string,
  record: SaveRecord,
  doc: SaveSlotDoc
): Promise<void> {
  await port.createRecord(recordId, record);
  try {
    await port.putSlot(doc);
  } catch (error) {
    try {
      await port.deleteRecord(recordId);
    } catch {
      // Best effort: remove orphan if possible; otherwise it is GC-eligible.
    }
    throw error;
  }
}

/** Best-effort pointer write (loadIssue markers). Swallows persistence errors. */
export async function bestEffortPutSlot(port: PersistencePort, doc: SaveSlotDoc): Promise<void> {
  try {
    await port.putSlot(doc);
  } catch {
    // Pointer maintenance is best-effort and never affects the load result.
  }
}

/**
 * Best-effort persist of a migrated record + pointer repoint. Preserves the
 * slot's existing updatedAt (chronological ordering) and clears loadIssue.
 * Returns the full error text on failure so the caller can emit a warning.
 */
export async function persistMigratedRecord(
  port: PersistencePort,
  recordId: string,
  record: SaveRecord,
  currentDoc: SaveSlotDoc
): Promise<{ ok: true; doc: SaveSlotDoc } | { ok: false; errorText: string }> {
  const newDoc: SaveSlotDoc = {
    ...currentDoc,
    recordId,
    updatedAt: currentDoc.updatedAt,
    loadIssue: null,
  };
  try {
    await writeRecordAndSlot(port, recordId, record, newDoc);
    return { ok: true, doc: newDoc };
  } catch (error) {
    const text = error instanceof SaveError ? error.message : String(error);
    return { ok: false, errorText: text };
  }
}
