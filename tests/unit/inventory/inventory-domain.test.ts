/**
 * FS-INV-001 AC-01..AC-04 — grants, stacks, removal, the generalized persisted
 * ledger (grant AND remove), quest protection, forced removal, atomicity, and
 * the read-only projection.
 *
 * Contract highlights frozen at the WO-022 plan review:
 * - Global inventory (one canonical InventorySavedState).
 * - Over-removal refuses with `insufficient-stack` (never a silent clip).
 * - The ledger rides inside domain.inventory and dedups BOTH grants and
 *   removals across reloads: entry = `${operation}:${occurrenceId}:${itemId}`.
 * - questProtected enforcement on ordinary removeItem; a separate named
 *   forceRemoveItem handles scripted removal (never a bypass flag).
 * - Non-stackable grants with count > 1 are refused (`non-stackable`).
 */
import { describe, it, expect } from 'vitest';
import {
  createInventoryState,
  addItem,
  removeItem,
  forceRemoveItem,
  hasItem,
  toInventoryView,
  EquipmentSlot,
  InventoryError,
  type InventorySavedState,
} from '../../../src/domain/inventory';
import { EQUIPMENT_SLOTS } from '../../../src/domain/inventory';

const TOOL = 'item_tool_relay_scanner';
const NOTCHES = 'item_consumable_notch';

function grant(
  state: InventorySavedState,
  itemId: string,
  occurrenceId: string,
  opts: { stackable?: boolean; count?: number; questProtected?: boolean } = {}
): InventorySavedState {
  return addItem(state, {
    itemId,
    occurrenceId,
    stackable: opts.stackable ?? false,
    ...(opts.count !== undefined ? { count: opts.count } : {}),
    ...(opts.questProtected !== undefined ? { questProtected: opts.questProtected } : {}),
  }).state;
}

describe('FS-INV-001 addItem (AC-01/AC-02)', () => {
  it('AC-01: a unique grant creates a count-1 entry and records the grant in the ledger', () => {
    const state = createInventoryState();
    const result = addItem(state, { itemId: TOOL, occurrenceId: 'occ-g1', stackable: false });
    expect(result.outcome).toBe('added');
    expect(result.state.items[TOOL]).toEqual({ itemId: TOOL, count: 1 });
    expect(result.state.ledger).toEqual([`grant:occ-g1:${TOOL}`]);
    expect(hasItem(result.state, TOOL)).toBe(true);
  });

  it('AC-02: stackable grants increment and keep one entry per legit occurrence', () => {
    let state = createInventoryState();
    state = grant(state, NOTCHES, 'occ-n1', { stackable: true, count: 3 });
    expect(state.items[NOTCHES]).toEqual({ itemId: NOTCHES, count: 3 });
    state = grant(state, NOTCHES, 'occ-n2', { stackable: true, count: 2 });
    expect(state.items[NOTCHES]).toEqual({ itemId: NOTCHES, count: 5 });
    expect(state.ledger).toEqual([`grant:occ-n1:${NOTCHES}`, `grant:occ-n2:${NOTCHES}`]);
    expect(hasItem(state, NOTCHES, 5)).toBe(true);
  });

  it('AC-02: replaying the same grant occurrence is duplicate and never re-adds', () => {
    let state = createInventoryState();
    state = grant(state, NOTCHES, 'occ-n1', { stackable: true, count: 3 });
    const before = state.items[NOTCHES];
    const replay = addItem(state, {
      itemId: NOTCHES,
      occurrenceId: 'occ-n1',
      stackable: true,
      count: 3,
    });
    expect(replay.outcome).toBe('duplicate');
    expect(replay.state.items[NOTCHES]).toEqual(before);
    expect(replay.state.ledger).toHaveLength(1);
  });

  it('AC-02: duplicate add after a save/reload round-trip stays a no-op (ledger persisted)', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    const restored = JSON.parse(JSON.stringify(state)) as InventorySavedState;
    const replay = addItem(restored, { itemId: TOOL, occurrenceId: 'occ-g1', stackable: false });
    expect(replay.outcome).toBe('duplicate');
    expect(replay.state).toEqual(restored);
  });

  it('AC-02: a distinct legitimate grant of the SAME unique item is refused (count stays 1)', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    const again = addItem(state, { itemId: TOOL, occurrenceId: 'occ-g2', stackable: false });
    // A unique item can never exceed quantity 1: a second distinct grant is a
    // deterministic no-op, not a silent second charge.
    expect(again.outcome).toBe('duplicate');
    expect(again.state.items[TOOL]).toEqual({ itemId: TOOL, count: 1 });
  });

  it('non-stackable grant with count > 1 is refused (non-stackable), atomic', () => {
    const state = createInventoryState();
    expect(() =>
      addItem(state, { itemId: TOOL, occurrenceId: 'occ-g1', stackable: false, count: 2 })
    ).toThrow(InventoryError);
    try {
      addItem(state, { itemId: TOOL, occurrenceId: 'occ-g1', stackable: false, count: 2 });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('non-stackable');
    }
    expect(state).toEqual(createInventoryState());
  });

  it('invalid grant counts are refused (negative-dimension), atomic', () => {
    const state = createInventoryState();
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        addItem(state, { itemId: NOTCHES, occurrenceId: 'occ-n0', stackable: true, count: bad })
      ).toThrow(InventoryError);
    }
    expect(state).toEqual(createInventoryState());
  });
});

describe('FS-INV-001 removeItem (AC-03)', () => {
  it('AC-03: removing decrements; reaching 0 deletes the key (depleted)', () => {
    let state = createInventoryState();
    state = grant(state, NOTCHES, 'occ-n1', { stackable: true, count: 3 });
    const partial = removeItem(state, { itemId: NOTCHES, occurrenceId: 'occ-r1', count: 1 });
    expect(partial.outcome).toBe('removed');
    expect(partial.state.items[NOTCHES]).toEqual({ itemId: NOTCHES, count: 2 });

    const finalUnit = removeItem(partial.state, {
      itemId: NOTCHES,
      occurrenceId: 'occ-r2',
      count: 2,
    });
    expect(finalUnit.outcome).toBe('depleted');
    expect(finalUnit.state.items[NOTCHES]).toBeUndefined();
    expect(hasItem(finalUnit.state, NOTCHES)).toBe(false);
    expect(finalUnit.state.ledger).toEqual([
      `grant:occ-n1:${NOTCHES}`,
      `remove:occ-r1:${NOTCHES}`,
      `remove:occ-r2:${NOTCHES}`,
    ]);
  });

  it('removing more than owned is insufficient-stack and leaves state unchanged', () => {
    let state = createInventoryState();
    state = grant(state, NOTCHES, 'occ-n1', { stackable: true, count: 2 });
    const before = JSON.stringify(state);
    expect(() => removeItem(state, { itemId: NOTCHES, occurrenceId: 'occ-r1', count: 3 })).toThrow(
      InventoryError
    );
    try {
      removeItem(state, { itemId: NOTCHES, occurrenceId: 'occ-r1', count: 3 });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('insufficient-stack');
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('removing an unowned item is unknown-item', () => {
    const state = createInventoryState();
    expect(() =>
      removeItem(state, { itemId: 'item_tool_missing', occurrenceId: 'occ-r1' })
    ).toThrow(InventoryError);
    try {
      removeItem(state, { itemId: 'item_tool_missing', occurrenceId: 'occ-r1' });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('unknown-item');
    }
  });

  it('replaying the same remove occurrence is duplicate and never re-consumes the stack', () => {
    let state = createInventoryState();
    state = grant(state, NOTCHES, 'occ-n1', { stackable: true, count: 3 });
    state = removeItem(state, { itemId: NOTCHES, occurrenceId: 'occ-r1', count: 1 }).state;
    const before = state.items[NOTCHES];
    const replay = removeItem(state, { itemId: NOTCHES, occurrenceId: 'occ-r1', count: 1 });
    expect(replay.outcome).toBe('duplicate');
    expect(replay.state.items[NOTCHES]).toEqual(before);
  });

  it('duplicate remove after a save/reload round-trip stays a no-op (ledger persisted)', () => {
    let state = createInventoryState();
    state = grant(state, NOTCHES, 'occ-n1', { stackable: true, count: 3 });
    state = removeItem(state, { itemId: NOTCHES, occurrenceId: 'occ-r1', count: 1 }).state;
    const restored = JSON.parse(JSON.stringify(state)) as InventorySavedState;
    const replay = removeItem(restored, { itemId: NOTCHES, occurrenceId: 'occ-r1', count: 1 });
    expect(replay.outcome).toBe('duplicate');
    expect(replay.state).toEqual(restored);
  });

  it('two distinct remove occurrences for the same item both apply', () => {
    let state = createInventoryState();
    state = grant(state, NOTCHES, 'occ-n1', { stackable: true, count: 4 });
    state = removeItem(state, { itemId: NOTCHES, occurrenceId: 'occ-r1', count: 1 }).state;
    state = removeItem(state, { itemId: NOTCHES, occurrenceId: 'occ-r2', count: 2 }).state;
    expect(state.items[NOTCHES]).toEqual({ itemId: NOTCHES, count: 1 });
    expect(state.ledger).toEqual([
      `grant:occ-n1:${NOTCHES}`,
      `remove:occ-r1:${NOTCHES}`,
      `remove:occ-r2:${NOTCHES}`,
    ]);
  });
});

describe('FS-INV-001 quest protection (AC-04)', () => {
  it('AC-04: ordinary removeItem on a quest-protected item is refused (quest-protected), atomic', () => {
    let state = createInventoryState();
    state = grant(state, 'item_document_keystone', 'occ-g1', { questProtected: true });
    const before = JSON.stringify(state);
    expect(() =>
      removeItem(state, { itemId: 'item_document_keystone', occurrenceId: 'occ-r1' })
    ).toThrow(InventoryError);
    try {
      removeItem(state, { itemId: 'item_document_keystone', occurrenceId: 'occ-r1' });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('quest-protected');
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('AC-04: protection survives a reload because it lives in content facts, not the ledger', () => {
    let state = createInventoryState();
    state = grant(state, 'item_document_keystone', 'occ-g1', { questProtected: true });
    const restored = JSON.parse(JSON.stringify(state)) as InventorySavedState;
    expect(hasItem(restored, 'item_document_keystone')).toBe(true);
    expect(() =>
      removeItem(restored, { itemId: 'item_document_keystone', occurrenceId: 'occ-r1' })
    ).toThrow(InventoryError);
  });

  it('forceRemoveItem is the ONLY scripted bypass, and it still records its own ledger entry', () => {
    let state = createInventoryState();
    state = grant(state, 'item_document_keystone', 'occ-g1', { questProtected: true });
    const forced = forceRemoveItem(state, {
      itemId: 'item_document_keystone',
      occurrenceId: 'occ-script',
    });
    expect(forced.outcome).toBe('depleted');
    expect(hasItem(forced.state, 'item_document_keystone')).toBe(false);
    expect(forced.state.ledger).toContain('force-remove:occ-script:item_document_keystone');
  });

  it('forceRemoveItem replay is a deterministic no-op', () => {
    let state = createInventoryState();
    state = grant(state, 'item_document_keystone', 'occ-g1', { questProtected: true });
    state = forceRemoveItem(state, {
      itemId: 'item_document_keystone',
      occurrenceId: 'occ-s',
    }).state;
    const replay = forceRemoveItem(state, {
      itemId: 'item_document_keystone',
      occurrenceId: 'occ-s',
    });
    expect(replay.outcome).toBe('duplicate');
    expect(hasItem(replay.state, 'item_document_keystone')).toBe(false);
  });

  it('a protected item under ordinary removal that is NOT owned reports unknown-item first', () => {
    const state = createInventoryState();
    try {
      removeItem(state, { itemId: 'item_document_keystone', occurrenceId: 'occ-r1' });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('unknown-item');
    }
  });
});

describe('FS-INV-001 envelope + projection', () => {
  it('createInventoryState is the canonical empty envelope', () => {
    expect(createInventoryState()).toEqual({ items: {}, equipped: {}, ledger: [] });
  });

  it('the slot enum is the frozen five-slot contract', () => {
    expect(EQUIPMENT_SLOTS).toEqual(['tool', 'device', 'clothing', 'credential', 'keepsake']);
    const s: EquipmentSlot = 'tool';
    expect(s).toBe('tool');
  });

  it('toInventoryView returns a read-only projection (sorted, no live domain refs)', () => {
    let state = createInventoryState();
    state = grant(state, NOTCHES, 'occ-n1', { stackable: true, count: 2 });
    state = { ...state, items: { ...state.items, zz: { itemId: 'zz', count: 1 } } };
    const view = toInventoryView(state);
    expect(view.items).toEqual([
      { itemId: NOTCHES, count: 2 },
      { itemId: 'zz', count: 1 },
    ]);
    expect(view.equipped).toEqual({});
  });
});
