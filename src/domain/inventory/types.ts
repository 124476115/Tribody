/**
 * Inventory Domain — core types (FS-INV-001)
 *
 * Pure TypeScript value contracts for the deterministic inventory/equipment
 * runtime. No Phaser, React, Zod, or Node.js built-ins.
 *
 * Design invariants (WO-022 plan review, maintainer-approved):
 * - Global inventory: ONE canonical `InventorySavedState`; there is no implicit
 *   per-PC ownership.
 * - The generalized persisted ledger dedups BOTH grants and removals across
 *   reloads. Entry = `${operation}:${occurrenceId}:${itemId}` where operation
 *   is `grant` | `remove` | `force-remove`.
 * - Over-removal REFUSES with `insufficient-stack` (atomic; never a partial
 *   clip).
 * - quest protection lives in CONTENT facts (never in the ledger) and is
 *   enforced by ordinary `removeItem`; forced removal uses the separately named
 *   `forceRemoveItem` which records its own `force-remove` ledger entry.
 * - Equip requires owned positive quantity, a canonical slot, and (at the
 *   application seam) content-resolved slot compatibility. Replacing an
 *   occupied slot preserves BOTH owned stacks. Removing the final owned unit of
 *   an equipped item is refused (`item-equipped`); there is no hidden
 *   auto-unequip.
 * - Stack invariants: positive integer counts only; zero means the key is
 *   absent; a non-stackable item is never granted beyond count 1.
 */

/** Canonical equipment slots — the tightened, fixed set. */
export const EQUIPMENT_SLOTS = ['tool', 'device', 'clothing', 'credential', 'keepsake'] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export function isEquipmentSlot(value: string): value is EquipmentSlot {
  return (EQUIPMENT_SLOTS as readonly string[]).includes(value);
}

/** One owned stack. `count` is always a positive integer. */
export interface ItemStack {
  /** Stable persistent identity; equals the map key; never display text. */
  itemId: string;
  /** Positive integer; zero is represented by the key being ABSENT. */
  count: number;
  /**
   * Content-resolved quest protection mirrored into the persisted stack at
   * grant time. The domain enforces it on ordinary `removeItem` so protection
   * survives reloads without reconstructing facts. ABSENT for normal items.
   */
  questProtected?: boolean;
}

/** The persisted inventory envelope joined into SavePayload.domain (schema v5). */
export interface InventorySavedState {
  /** Keyed by stable itemId; zero-count stacks are never stored. */
  items: Record<string, ItemStack>;
  /** Canonical five-slot equipment; values are owned itemIds. */
  equipped: Partial<Record<EquipmentSlot, string>>;
  /**
   * Generalized persisted mutation ledger: `<operation>:<occurrenceId>:<itemId>`,
   * operation ∈ {grant, remove, force-remove}. The same logical occurrence must
   * not mutate twice even across a reload.
   */
  ledger: string[];
}

export type LedgerOperation = 'grant' | 'remove' | 'force-remove';

/** Stable, parseable ledger entry string. */
export type LedgerEntry = `${LedgerOperation}:${string}:${string}`;

/** The grant input. `occurrenceId` is STABLE and owned by the producer. */
export interface AddItemRequest {
  itemId: string;
  /** Stable occurrence identity owned by the producer. */
  occurrenceId: string;
  /** Content-resolved stackability; a non-stackable grant caps at count 1. */
  stackable: boolean;
  /** Default 1; must be a positive integer. */
  count?: number;
  /**
   * Content-resolved quest protection (default false). When true the granted
   * stack is persisted as `questProtected` and ordinary `removeItem` refuses
   * mutation until `forceRemoveItem` (never a bypass flag on removeItem).
   */
  questProtected?: boolean;
}

/** The removal input. `count` defaults to 1. */
export interface RemoveItemRequest {
  itemId: string;
  occurrenceId: string;
  count?: number;
}

/** Equip input; the slot is content-resolved downstream of this domain. */
export interface EquipItemRequest {
  itemId: string;
  slot: EquipmentSlot;
}

export interface UnequipItemRequest {
  slot: EquipmentSlot;
}

export type AddItemOutcome = 'added' | 'duplicate';

export type RemoveItemOutcome = 'removed' | 'depleted' | 'duplicate';

export type EquipOutcome = 'equipped' | 'replaced' | 'no-change';

export type UnequipOutcome = 'unequipped';

export interface InventoryMutationResult {
  /** Next immutable state. */
  state: InventorySavedState;
  outcome: AddItemOutcome | RemoveItemOutcome | EquipOutcome | UnequipOutcome;
}

/** Typed, deterministic inventory failure. Consumers branch on `.code`. */
export type InventoryErrorCode =
  | 'unknown-item'
  | 'insufficient-stack'
  | 'quest-protected'
  | 'item-equipped'
  | 'non-stackable'
  | 'negative-dimension'
  | 'invalid-slot'
  | 'not-equipped';

export class InventoryError extends Error {
  readonly code: InventoryErrorCode;

  constructor(code: InventoryErrorCode, message: string) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
  }
}

/** Read-only projection for HUD consumers; never exposes mutable domain objects. */
export interface InventoryView {
  items: { itemId: string; count: number }[];
  equipped: Partial<Record<EquipmentSlot, string>>;
  /** Total owned stacks (not raw unit counts). */
  slotsUsed: number;
}

export function ledgerEntry(
  operation: LedgerOperation,
  occurrenceId: string,
  itemId: string
): LedgerEntry {
  return `${operation}:${occurrenceId}:${itemId}`;
}

export function ledgerOperationOf(entry: string): LedgerOperation | null {
  const op = entry.split(':', 1)[0] ?? '';
  return op === 'grant' || op === 'remove' || op === 'force-remove' ? op : null;
}
