/**
 * Save System — slot policy (FS-SAVE-001)
 *
 * Slot model: 3 manual + 1 quick + 5 rotating autosaves. Rotation evicts the
 * autosave with the smallest (updatedAt, slotId) — deterministic on ties —
 * and never touches manual or quick slots. `updatedAt`/`createdAt` from the
 * migration transform are preserved; only NEW writes bump them.
 */
import type { SaveSlotDoc, SaveSlotId, SaveSlotKind, SaveScope } from '../../domain/save';
import { SAVE_SLOT_IDS } from '../../domain/save';

export const AUTO_SLOT_IDS: SaveSlotId[] = ['auto-1', 'auto-2', 'auto-3', 'auto-4', 'auto-5'];

export function isAutoSlot(slotId: string): boolean {
  return (AUTO_SLOT_IDS as readonly string[]).includes(slotId);
}

export function isManualSlot(slotId: string): boolean {
  return slotId.startsWith('manual-') && (SAVE_SLOT_IDS as readonly string[]).includes(slotId);
}

export function isQuickSlot(slotId: string): boolean {
  return slotId === 'quick';
}

export function isKnownSlot(slotId: string): slotId is SaveSlotId {
  return (SAVE_SLOT_IDS as readonly string[]).includes(slotId);
}

export function kindForSlot(slotId: SaveSlotId): SaveSlotKind {
  if (isAutoSlot(slotId)) return 'autosave';
  if (isQuickSlot(slotId)) return 'quick';
  return 'manual';
}

export function scopeFor(kind: SaveSlotKind): SaveScope {
  switch (kind) {
    case 'autosave':
      return 'autosave';
    case 'quick':
      return 'quick';
    case 'manual':
      return 'manual';
  }
}

/**
 * Choose the destination autosave slot id: the first free one, or the eviction
 * target. Eviction = smallest (updatedAt, slotId) among existing autosaves.
 */
export function pickAutosaveSlot(existing: SaveSlotDoc[]): SaveSlotId {
  const autosaves = existing.filter((doc) => doc.kind === 'autosave');
  const used = new Set(autosaves.map((doc) => doc.slotId));
  const firstFree = AUTO_SLOT_IDS.find((id) => !used.has(id));
  if (firstFree !== undefined) return firstFree;
  const victim = [...autosaves].sort(
    (a, b) => a.updatedAt - b.updatedAt || a.slotId.localeCompare(b.slotId)
  )[0];
  if (victim === undefined) {
    throw new Error('unreachable: autosaves full but no victim');
  }
  return victim.slotId;
}
