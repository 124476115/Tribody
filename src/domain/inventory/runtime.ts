/**
 * Inventory Runtime — deterministic state machine (FS-INV-001)
 *
 * Pure, deterministic, fully serializable. Failures are typed
 * `InventoryError`s that leave the previous state untouched. Every mutation is
 * atomic: over-removal is REFUSED, never clipped; quest protection is enforced
 * by ordinary `removeItem` (facts come from content via the application seam);
 * `forceRemoveItem` is the only scripted bypass and records a `force-remove`
 * ledger entry. The ledger (`grant`/`remove`/`force-remove` per occurrence+item)
 * is persisted inside the domain, so the same logical occurrence never mutates
 * twice across a reload.
 */
import {
  InventoryError,
  isEquipmentSlot,
  ledgerEntry,
  type AddItemRequest,
  type EquipmentSlot,
  type EquipItemRequest,
  type InventoryMutationResult,
  type InventorySavedState,
  type InventoryView,
  type ItemStack,
  type RemoveItemRequest,
  type UnequipItemRequest,
} from './types';

export function createInventoryState(): InventorySavedState {
  return { items: {}, equipped: {}, ledger: [] };
}

export function hasItem(state: InventorySavedState, itemId: string, count = 1): boolean {
  const owned = state.items[itemId];
  return owned !== undefined && owned.count >= count;
}

function validateCount(count: unknown, defaultCount: number, path: string): number {
  const value = count ?? defaultCount;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new InventoryError(
      'negative-dimension',
      `${path} must be a positive integer (got ${
        typeof value === 'string'
          ? value
          : typeof value === 'number'
            ? String(value)
            : 'non-numeric'
      })`
    );
  }
  return value;
}

/** Rebuild a record without `key` — immutable, dynamic-delete free. */
function withoutKey<K extends PropertyKey>(
  record: Partial<Record<K, unknown>>,
  key: K
): Partial<Record<K, unknown>> {
  const next: Partial<Record<K, unknown>> = {};
  for (const k of Object.keys(record) as K[]) {
    if (k !== key) next[k] = record[k];
  }
  return next;
}

export function addItem(
  state: InventorySavedState,
  request: AddItemRequest
): InventoryMutationResult {
  const count = validateCount(request.count, 1, 'addItem.count');
  if (!request.stackable && count !== 1) {
    throw new InventoryError(
      'non-stackable',
      `cannot grant non-stackable item "${request.itemId}" with count ${String(count)}`
    );
  }
  const entry = ledgerEntry('grant', request.occurrenceId, request.itemId);
  if (state.ledger.includes(entry)) {
    return { state, outcome: 'duplicate' };
  }
  const existing = state.items[request.itemId];
  const protectedStack =
    existing?.questProtected === true || request.questProtected === true ? true : undefined;
  if (!request.stackable) {
    // Unique item: a second DISTINCT grant occurrence is a deterministic no-op
    // (never a silent second charge). Legit second copies are authored as the
    // same occurrence (which dedups above).
    if (existing !== undefined) {
      return { state, outcome: 'duplicate' };
    }
    const granted: ItemStack = { itemId: request.itemId, count: 1 };
    const nextStack = protectedStack === true ? { ...granted, questProtected: true } : granted;
    return {
      state: {
        items: { ...state.items, [request.itemId]: nextStack },
        equipped: state.equipped,
        ledger: [...state.ledger, entry],
      },
      outcome: 'added',
    };
  }
  const nextCount = (existing?.count ?? 0) + count;
  const merged: ItemStack = { itemId: request.itemId, count: nextCount };
  const nextStack = protectedStack === true ? { ...merged, questProtected: true } : merged;
  return {
    state: {
      items: { ...state.items, [request.itemId]: nextStack },
      equipped: state.equipped,
      ledger: [...state.ledger, entry],
    },
    outcome: 'added',
  };
}

export interface RemoveItemRequestArgs extends RemoveItemRequest {
  /**
   * Content-resolved quest-protection flag (default false). The ordinary
   * removeItem path enforces it; forceRemoveItem deliberately ignores it.
   */
  questProtected?: boolean;
}

function performRemove(
  state: InventorySavedState,
  operation: 'remove' | 'force-remove',
  request: RemoveItemRequestArgs
): InventoryMutationResult {
  const count = validateCount(request.count, 1, 'removeItem.count');
  const entry = ledgerEntry(operation, request.occurrenceId, request.itemId);
  if (state.ledger.includes(entry)) {
    return { state, outcome: 'duplicate' };
  }
  const stack = state.items[request.itemId];
  if (stack === undefined) {
    throw new InventoryError('unknown-item', `no owned stack for "${request.itemId}"`);
  }
  if (
    operation === 'remove' &&
    (request.questProtected === true || stack.questProtected === true)
  ) {
    throw new InventoryError(
      'quest-protected',
      `"${request.itemId}" is required by the quest and cannot be removed`
    );
  }
  if (count > stack.count) {
    throw new InventoryError(
      'insufficient-stack',
      `cannot remove ${String(count)} of "${request.itemId}": only ${String(stack.count)} owned`
    );
  }
  const isEquipped = Object.values(state.equipped).includes(request.itemId);
  if (count === stack.count && isEquipped) {
    throw new InventoryError(
      'item-equipped',
      `"${request.itemId}" is equipped; unequip it before removing its final unit`
    );
  }
  const nextCount = stack.count - count;
  const items =
    nextCount === 0
      ? (withoutKey(state.items, request.itemId) as Record<string, ItemStack>)
      : { ...state.items, [request.itemId]: { itemId: request.itemId, count: nextCount } };
  return {
    state: { items, equipped: state.equipped, ledger: [...state.ledger, entry] },
    outcome: nextCount === 0 ? 'depleted' : 'removed',
  };
}

export function removeItem(
  state: InventorySavedState,
  request: RemoveItemRequestArgs
): InventoryMutationResult {
  return performRemove(state, 'remove', request);
}

/**
 * The ONLY scripted bypass of quest protection. It records a `force-remove`
 * ledger entry so a replayed occurrence stays a no-op; all other invariants
 * (stack bounds, equipped final-unit rule) still hold.
 */
export function forceRemoveItem(
  state: InventorySavedState,
  request: RemoveItemRequest
): InventoryMutationResult {
  return performRemove(state, 'force-remove', request);
}

export function equipItem(
  state: InventorySavedState,
  request: EquipItemRequest
): InventoryMutationResult {
  const slotName: string = request.slot;
  if (!isEquipmentSlot(request.slot)) {
    throw new InventoryError('invalid-slot', `"${slotName}" is not a canonical slot`);
  }
  const current = state.items[request.itemId];
  if (current === undefined) {
    throw new InventoryError('unknown-item', `cannot equip unowned item "${request.itemId}"`);
  }
  if (state.equipped[request.slot] === request.itemId) {
    return { state, outcome: 'no-change' };
  }
  const replaced = state.equipped[request.slot];
  return {
    state: {
      items: state.items,
      equipped: { ...state.equipped, [request.slot]: request.itemId },
      ledger: state.ledger,
    },
    outcome: replaced === undefined ? 'equipped' : 'replaced',
  };
}

export function unequipItem(
  state: InventorySavedState,
  request: UnequipItemRequest
): InventoryMutationResult {
  const slotName: string = request.slot;
  if (!isEquipmentSlot(request.slot)) {
    throw new InventoryError('invalid-slot', `"${slotName}" is not a canonical slot`);
  }
  if (state.equipped[request.slot] === undefined) {
    throw new InventoryError('not-equipped', `slot "${slotName}" holds nothing`);
  }
  const equipped = withoutKey(state.equipped, request.slot) as Partial<
    Record<EquipmentSlot, string>
  >;
  return {
    state: { items: state.items, equipped, ledger: state.ledger },
    outcome: 'unequipped',
  };
}

export function toInventoryView(state: InventorySavedState): InventoryView {
  const entries = Object.values(state.items)
    .map((stack) => ({ itemId: stack.itemId, count: stack.count }))
    .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
  return {
    items: entries,
    equipped: { ...state.equipped },
    slotsUsed: entries.length,
  };
}
