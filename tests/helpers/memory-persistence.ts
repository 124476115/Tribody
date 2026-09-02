/**
 * Memory persistence port with create-only immutable records + slot pointer doc,
 * mirroring the IndexedDB `add` semantics and the two-phase atomicity contract
 * (WO-013). Supports one-shot fault arming to simulate interrupted writes.
 */
import type { PersistencePort } from '../../src/application/save';
import {
  SaveError,
  type SaveRecord,
  type SaveSlotDoc,
  type SaveSlotId,
} from '../../src/domain/save';

export interface MemoryFaults {
  /** Next createRecord call throws then auto-clears. */
  failNextCreateRecord: boolean;
  /** Next putSlot call throws then auto-clears. */
  failNextPutSlot: boolean;
  /** Next deleteRecord call throws then auto-clears. */
  failNextDeleteRecord: boolean;
  /** Next getRecord call throws then auto-clears. */
  failNextGetRecord: boolean;
}

export class MemoryPersistence implements PersistencePort {
  records = new Map<string, SaveRecord>();
  slots = new Map<string, SaveSlotDoc>();
  faults: MemoryFaults = {
    failNextCreateRecord: false,
    failNextPutSlot: false,
    failNextDeleteRecord: false,
    failNextGetRecord: false,
  };
  invocations = { createRecord: 0, putSlot: 0 };

  async createRecord(recordId: string, record: SaveRecord): Promise<void> {
    this.invocations.createRecord += 1;
    if (this.faults.failNextCreateRecord) {
      this.faults.failNextCreateRecord = false;
      throw new SaveError('persistence-error', 'injected createRecord failure');
    }
    if (this.records.has(recordId)) {
      throw new SaveError('persistence-collision', `collision: ${recordId}`);
    }
    this.records.set(recordId, JSON.parse(JSON.stringify(record)) as SaveRecord);
  }

  async getRecord(recordId: string): Promise<SaveRecord | null> {
    if (this.faults.failNextGetRecord) {
      this.faults.failNextGetRecord = false;
      throw new SaveError('persistence-error', 'injected getRecord failure');
    }
    const record = this.records.get(recordId);
    return record === undefined ? null : (JSON.parse(JSON.stringify(record)) as SaveRecord);
  }

  async deleteRecord(recordId: string): Promise<void> {
    if (this.faults.failNextDeleteRecord) {
      this.faults.failNextDeleteRecord = false;
      throw new SaveError('persistence-error', 'injected deleteRecord failure');
    }
    this.records.delete(recordId);
  }

  async listRecordIds(): Promise<string[]> {
    return [...this.records.keys()];
  }

  async listSlots(): Promise<SaveSlotDoc[]> {
    return [...this.slots.values()].map((d) => JSON.parse(JSON.stringify(d)) as SaveSlotDoc);
  }

  async getSlot(slotId: SaveSlotId): Promise<SaveSlotDoc | null> {
    const doc = this.slots.get(slotId);
    return doc === undefined ? null : (JSON.parse(JSON.stringify(doc)) as SaveSlotDoc);
  }

  async putSlot(doc: SaveSlotDoc): Promise<void> {
    this.invocations.putSlot += 1;
    if (this.faults.failNextPutSlot) {
      this.faults.failNextPutSlot = false;
      throw new SaveError('persistence-error', 'injected putSlot failure');
    }
    this.slots.set(doc.slotId, JSON.parse(JSON.stringify(doc)) as SaveSlotDoc);
  }

  async deleteSlot(slotId: SaveSlotId): Promise<void> {
    this.slots.delete(slotId);
  }

  /** Records left in the store that no slot references. */
  orphanRecordIds(): string[] {
    const referenced = new Set([...this.slots.values()].map((d) => d.recordId));
    return [...this.records.keys()].filter((id) => !referenced.has(id));
  }
}
