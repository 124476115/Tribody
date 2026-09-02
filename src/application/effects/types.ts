/**
 * Inventory effect executor — types (FS-INV-001 AC-11)
 *
 * The concrete cross-system integration that owns the `add_item` /
 * `remove_item` EffectRequest seam. Lives in the application layer, NOT inside
 * the dialogue or quest reducers.
 */
import type { EffectRequest } from '../../domain/dialogue';
import type { EquipmentSlot, InventorySavedState } from '../../domain/inventory';

/** Content-resolved item resolution (stackability/protection/slot). */
export interface ItemResolution {
  itemId: string;
  stackable: boolean;
  questProtected: boolean;
  slot?: EquipmentSlot;
}

export type ResolveItem = (itemId: string) => ItemResolution | undefined;

/** Typed skip reasons mirror selected domain InventoryError codes. */
export type InventorySkipReason =
  | 'unknown-item'
  | 'insufficient-stack'
  | 'quest-protected'
  | 'item-equipped'
  | 'non-stackable'
  | 'negative-dimension'
  | 'invalid-slot'
  | 'not-equipped';

export interface AppliedItemEffect {
  itemId: string;
  occurrenceId: string;
  outcome: 'applied' | 'duplicate' | 'skipped';
  skipReason?: InventorySkipReason;
}

/** Item facts for quest listeners. The kind strings are the frozen contract. */
export type ItemEffectFact =
  | { kind: 'item.acquired'; itemId: string; count: number; occurrenceId: string }
  | { kind: 'item.removed'; itemId: string; count: number; occurrenceId: string };

export interface ApplyItemEffectsInput {
  inventory: InventorySavedState;
  effects: readonly EffectRequest[];
  resolveItem: ResolveItem;
}

export interface ApplyItemEffectsResult {
  state: InventorySavedState;
  facts: ItemEffectFact[];
  applied: AppliedItemEffect[];
}
