/**
 * Save System — IndexedDB persistence adapter (FS-SAVE-001)
 *
 * Implements the PersistencePort with create-only (add semantics) immutable
 * records + mutable slot pointer docs. All port errors are normalized to the
 * SaveError taxonomy (persistence-collision / persistence-quota /
 * persistence-error). Browsers only; no Node path.
 */
import { SaveError, type SaveRecord, type SaveSlotDoc, type SaveSlotId } from '../../domain/save';
import type { PersistencePort } from '../../application/save';

const DB_NAME = 'trisolaris_saves';
const DB_VERSION = 1;
const RECORD_STORE = 'save_records';
const SLOT_STORE = 'save_slots';

function promiseRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      const code = (request.error as DOMException | undefined)?.name;
      if (code === 'ConstraintError') {
        reject(new SaveError('persistence-collision', `record id already exists`));
        return;
      }
      if (code === 'QuotaExceededError') {
        reject(new SaveError('persistence-quota', 'storage quota exceeded'));
        return;
      }
      reject(
        new SaveError(
          'persistence-error',
          `indexeddb error: ${code ?? 'unknown'} ${request.error?.message ?? ''}`
        )
      );
    };
  });
}

function promiseTx(tx: IDBTransaction, work: Promise<unknown>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      void work.then(
        () => {
          resolve();
        },
        (error: unknown) => {
          reject(
            error instanceof Error ? error : new SaveError('persistence-error', String(error))
          );
        }
      );
    };
    tx.onerror = () => {
      const code = (tx.error as DOMException | undefined)?.name;
      reject(
        new SaveError(
          'persistence-error',
          `indexeddb transaction error: ${code ?? 'unknown'} ${tx.error?.message ?? ''}`
        )
      );
    };
    tx.onabort = () => {
      reject(new SaveError('persistence-error', 'indexeddb transaction aborted'));
    };
  });
}

export class IndexedDBPersistence implements PersistencePort {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    return (this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECORD_STORE)) {
          db.createObjectStore(RECORD_STORE, { keyPath: 'recordId' });
        }
        if (!db.objectStoreNames.contains(SLOT_STORE)) {
          db.createObjectStore(SLOT_STORE, { keyPath: 'slotId' });
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(
          new SaveError(
            'persistence-error',
            `indexeddb open failed: ${request.error?.message ?? 'unknown'}`
          )
        );
      };
    }));
  }

  async createRecord(recordId: string, record: SaveRecord): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(RECORD_STORE, 'readwrite');
    const store = tx.objectStore(RECORD_STORE);
    const work = promiseRequest(store.add({ ...record, recordId }));
    return promiseTx(tx, work);
  }

  async getRecord(recordId: string): Promise<SaveRecord | null> {
    const db = await this.db();
    const tx = db.transaction(RECORD_STORE, 'readonly');
    const store = tx.objectStore(RECORD_STORE);
    const result = await promiseRequest<SaveRecord | undefined>(
      store.get(recordId) as IDBRequest<SaveRecord | undefined>
    );
    return result ?? null;
  }

  async deleteRecord(recordId: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(RECORD_STORE, 'readwrite');
    const store = tx.objectStore(RECORD_STORE);
    const work = promiseRequest(store.delete(recordId));
    return promiseTx(tx, work);
  }

  async listRecordIds(): Promise<string[]> {
    const db = await this.db();
    const tx = db.transaction(RECORD_STORE, 'readonly');
    const store = tx.objectStore(RECORD_STORE);
    const keys = await promiseRequest<IDBValidKey[]>(store.getAllKeys());
    return keys.filter((key): key is string => typeof key === 'string');
  }

  async listSlots(): Promise<SaveSlotDoc[]> {
    const db = await this.db();
    const tx = db.transaction(SLOT_STORE, 'readonly');
    const store = tx.objectStore(SLOT_STORE);
    const docs = await promiseRequest(store.getAll());
    return docs as SaveSlotDoc[];
  }

  async getSlot(slotId: SaveSlotId): Promise<SaveSlotDoc | null> {
    const db = await this.db();
    const tx = db.transaction(SLOT_STORE, 'readonly');
    const store = tx.objectStore(SLOT_STORE);
    const result = await promiseRequest<SaveSlotDoc | undefined>(
      store.get(slotId) as IDBRequest<SaveSlotDoc | undefined>
    );
    return result ?? null;
  }

  async putSlot(doc: SaveSlotDoc): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(SLOT_STORE, 'readwrite');
    const store = tx.objectStore(SLOT_STORE);
    const work = promiseRequest(store.put(doc));
    return promiseTx(tx, work);
  }

  async deleteSlot(slotId: SaveSlotId): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(SLOT_STORE, 'readwrite');
    const store = tx.objectStore(SLOT_STORE);
    const work = promiseRequest(store.delete(slotId));
    return promiseTx(tx, work);
  }
}
