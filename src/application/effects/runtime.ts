/**
 * Inventory effect executor — runtime (FS-INV-001 AC-11/AC-12)
 *
 * Frozen executor contracts:
 * - Does NOT own canonical inventory state — the domain does, and every request
 *   routes through the domain reducers with `occurrenceId = instanceId`.
 * - Does NOT directly modify Quest/Dialogue state.
 * - Emits a successful item fact ONLY for a successfully applied, non-duplicate
 *   mutation. Failed and deduplicated requests are skipped/duplicate with a
 *   typed reason and produce no fact.
 * - Never bypasses Inventory's replay/idempotency contract, and never uses
 *   `forceRemoveItem` (forced removal stays a separately named scripted command,
 *   outside the dialogue effect surface).
 */
import {
  addItem,
  removeItem,
  InventoryError,
  type InventoryMutationResult,
  type InventorySavedState,
} from '../../domain/inventory';
import type {
  ApplyItemEffectsInput,
  ApplyItemEffectsResult,
  AppliedItemEffect,
  InventorySkipReason,
  ItemEffectFact,
} from './types';

export function applyItemEffects(input: ApplyItemEffectsInput): ApplyItemEffectsResult {
  let state: InventorySavedState = input.inventory;
  const facts: ItemEffectFact[] = [];
  const applied: AppliedItemEffect[] = [];

  for (const effect of input.effects) {
    if (effect.kind !== 'add_item' && effect.kind !== 'remove_item') continue;
    const { itemId, instanceId } = effect;
    const count = effect.count ?? 1;
    const resolution = input.resolveItem(itemId);
    if (resolution === undefined) {
      applied.push({
        itemId,
        occurrenceId: instanceId,
        outcome: 'skipped',
        skipReason: 'unknown-item',
      });
      continue;
    }

    const record = (outcome: AppliedItemEffect['outcome'], skipReason?: InventorySkipReason) => {
      const entry: AppliedItemEffect = { itemId, occurrenceId: instanceId, outcome };
      if (skipReason !== undefined) entry.skipReason = skipReason;
      applied.push(entry);
      return entry;
    };

    let mutation: InventoryMutationResult | undefined;
    try {
      if (effect.kind === 'add_item') {
        mutation = addItem(state, {
          itemId,
          occurrenceId: instanceId,
          stackable: resolution.stackable,
          count,
        });
      } else {
        mutation = removeItem(state, {
          itemId,
          occurrenceId: instanceId,
          count,
          questProtected: resolution.questProtected,
        });
      }
    } catch (error) {
      if (error instanceof InventoryError) {
        record('skipped', error.code);
        continue;
      }
      throw error;
    }

    if (mutation.outcome === 'duplicate') {
      record('duplicate');
      continue;
    }

    record('applied');
    if (effect.kind === 'add_item') {
      facts.push({ kind: 'item.acquired', itemId, count, occurrenceId: instanceId });
    } else {
      facts.push({ kind: 'item.removed', itemId, count, occurrenceId: instanceId });
    }
    state = mutation.state;
  }

  return { state, facts, applied };
}
