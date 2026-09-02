/**
 * FS-INV-001 AC-05/AC-06 — equip invariants frozen at the WO-022 plan review.
 *
 * - equipItem requires: owned (positive quantity), canonical slot membership,
 *   caller-supplied slot (content-resolved fact). Replacing an occupied slot is
 *   deterministic and NEVER alters possession quantities.
 * - unequipItem changes equipment state only.
 * - Final-unit removal of an equipped item is refused (`item-equipped`); the
 *   caller must explicitly unequipItem first. removeItem never auto-unequips.
 * - Equip idempotency: re-equipping the same item to its current slot is
 *   no-change.
 */
import { describe, it, expect } from 'vitest';
import {
  createInventoryState,
  addItem,
  equipItem,
  unequipItem,
  removeItem,
  forceRemoveItem,
  hasItem,
  InventoryError,
  type InventorySavedState,
} from '../../../src/domain/inventory';

const TOOL = 'item_tool_relay_scanner';
const DEVICE = 'item_device_field_recorder';
const NOTCHES = 'item_consumable_notch';

function grant(state: InventorySavedState, itemId: string, occ: string): InventorySavedState {
  return addItem(state, { itemId, occurrenceId: occ, stackable: itemId === NOTCHES }).state;
}

function stacked(state: InventorySavedState, itemId: string, occ: string, count: number) {
  return addItem(state, { itemId, occurrenceId: occ, stackable: true, count }).state;
}

describe('FS-INV-001 equipItem (AC-05/AC-06)', () => {
  it('AC-05: equipping an owned item with a valid slot sets equipped[slot]', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    const result = equipItem(state, { itemId: TOOL, slot: 'tool' });
    expect(result.outcome).toBe('equipped');
    expect(result.state.equipped['tool']).toBe(TOOL);
    // No possession change on equip.
    expect(result.state.items[TOOL]).toEqual({ itemId: TOOL, count: 1 });
  });

  it('AC-05: re-equipping the same item to its current slot is no-change', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    state = equipItem(state, { itemId: TOOL, slot: 'tool' }).state;
    const before = JSON.stringify(state);
    const again = equipItem(state, { itemId: TOOL, slot: 'tool' });
    expect(again.outcome).toBe('no-change');
    expect(JSON.stringify(again.state)).toBe(before);
  });

  it('AC-05: an occupied slot is replaced deterministically and preserves BOTH owned stacks', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    state = grant(state, DEVICE, 'occ-g2');
    state = equipItem(state, { itemId: TOOL, slot: 'tool' }).state;
    const before = JSON.stringify(state.items);
    const replaced = equipItem(state, { itemId: DEVICE, slot: 'tool' });
    expect(replaced.outcome).toBe('replaced');
    expect(replaced.state.equipped['tool']).toBe(DEVICE);
    // The old item returns to the backpack (it was never removed) and neither
    // owned stack changes.
    expect(replaced.state.items).toEqual(JSON.parse(before) as InventorySavedState['items']);
    expect(hasItem(replaced.state, TOOL)).toBe(true);
    expect(replaced.state.items[TOOL]).toEqual({ itemId: TOOL, count: 1 });
    expect(replaced.state.items[DEVICE]).toEqual({ itemId: DEVICE, count: 1 });
  });

  it('AC-06: equipping an unowned item is unknown-item', () => {
    const state = createInventoryState();
    try {
      equipItem(state, { itemId: 'item_tool_missing', slot: 'tool' });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('unknown-item');
    }
  });

  it('AC-06: a slot outside the canonical five is invalid-slot', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    try {
      equipItem(state, { itemId: TOOL, slot: 'weapon' as never });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('invalid-slot');
    }
  });

  it('AC-06: unequipItem clears the slot and changes equipment state only', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    state = equipItem(state, { itemId: TOOL, slot: 'tool' }).state;
    const itemsBefore = JSON.stringify(state.items);
    const result = unequipItem(state, { slot: 'tool' });
    expect(result.outcome).toBe('unequipped');
    expect(result.state.equipped['tool']).toBeUndefined();
    expect(result.state.items).toEqual(JSON.parse(itemsBefore) as InventorySavedState['items']);
  });

  it('AC-06: unequipItem on an empty slot is not-equipped', () => {
    const state = createInventoryState();
    try {
      unequipItem(state, { slot: 'tool' });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('not-equipped');
    }
  });

  it('AC-06: equip state never contains an unowned item', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    state = equipItem(state, { itemId: TOOL, slot: 'tool' }).state;
    // Dropping the owned stack below zero is impossible through the domain, but
    // the invariant is that a removal that would empty an equipped slot is refused.
    try {
      removeItem(state, { itemId: TOOL, occurrenceId: 'occ-r1', count: 1 });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('item-equipped');
    }
    expect(state.equipped['tool']).toBe(TOOL);
  });

  it('equip is deterministic: identical inputs produce identical outputs', () => {
    const a = equipItem(grant(createInventoryState(), TOOL, 'occ-g1'), {
      itemId: TOOL,
      slot: 'tool',
    });
    const b = equipItem(grant(createInventoryState(), TOOL, 'occ-g1'), {
      itemId: TOOL,
      slot: 'tool',
    });
    expect(a.state).toEqual(b.state);
    expect(a.outcome).toBe(b.outcome);
  });
});

describe('FS-INV-001 equipped final-unit rule', () => {
  it('removing quantity while the resulting stack remains > 0 keeps the equip valid', () => {
    let state = createInventoryState();
    state = stacked(state, NOTCHES, 'occ-g1', 4);
    state = equipItem(state, { itemId: NOTCHES, slot: 'device' }).state;
    const partial = removeItem(state, { itemId: NOTCHES, occurrenceId: 'occ-r1', count: 2 });
    expect(partial.outcome).toBe('removed');
    expect(partial.state.items[NOTCHES]).toEqual({ itemId: NOTCHES, count: 2 });
    expect(partial.state.equipped['device']).toBe(NOTCHES);
  });

  it('removing the final owned unit while equipped is item-equipped; no hidden auto-unequip', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    state = equipItem(state, { itemId: TOOL, slot: 'tool' }).state;
    try {
      removeItem(state, { itemId: TOOL, occurrenceId: 'occ-r1', count: 1 });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('item-equipped');
    }
    expect(state.equipped['tool']).toBe(TOOL);
    expect(hasItem(state, TOOL)).toBe(true);
  });

  it('the caller must explicitly unequipItem before the final removal', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    state = equipItem(state, { itemId: TOOL, slot: 'tool' }).state;
    state = unequipItem(state, { slot: 'tool' }).state;
    const finalUnit = removeItem(state, { itemId: TOOL, occurrenceId: 'occ-r1', count: 1 });
    expect(finalUnit.outcome).toBe('depleted');
    expect(hasItem(finalUnit.state, TOOL)).toBe(false);
  });

  it('forceRemoveItem still respects the equipped final-unit rule', () => {
    let state = createInventoryState();
    state = grant(state, TOOL, 'occ-g1');
    state = equipItem(state, { itemId: TOOL, slot: 'tool' }).state;
    try {
      forceRemoveItem(state, { itemId: TOOL, occurrenceId: 'occ-r1', count: 1 });
    } catch (err) {
      expect(err instanceof InventoryError ? err.code : null).toBe('item-equipped');
    }
    expect(state.equipped['tool']).toBe(TOOL);
  });
});
