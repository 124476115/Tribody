/**
 * Domain Event Kernel — type contracts (FS-EVENTS-001)
 *
 * Pure TypeScript value/type contracts. The only runtime value defined here is
 * the DomainEventContractError class. No Phaser / React / browser imports.
 */
import type { SaveSlotId } from '../save';

/** Opaque occurrence identity. Kernel never generates these; callers supply them. */
export type EventId = string & { readonly __brand: 'EventId' };

/** Semantic category string. Distinct from EventId: one category, many occurrences. */
export type EventType = string;

/** Positive logical sequence, assigned exclusively by the processor. */
export type Sequence = number & { readonly __brand: 'Sequence' };

/** Structural JSON-safe value. Rejects host objects, functions, cycles, non-finite numbers. */
export type JSONValue =
  null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };

/** An occurred fact. `sequence` is only ever assigned by the kernel processor. */
export interface DomainEvent<T extends EventType = EventType, P extends JSONValue = JSONValue> {
  readonly id: EventId;
  readonly type: T;
  readonly payload: P;
  readonly sequence: Sequence;
}

/**
 * An occurred fact that has not yet been sequenced:
 * `Omit<DomainEvent, 'sequence'>`. The `Omit` is compile-time only; the
 * processor re-rejects any runtime `sequence` field on the object.
 */
export type DraftEvent<T extends EventType = EventType, P extends JSONValue = JSONValue> = Omit<
  DomainEvent<T, P>,
  'sequence'
>;

/** Pure, non-mutating transition: new state from current state and one event. */
export type Reducer<S, E extends DomainEvent = DomainEvent> = (state: S, event: E) => S;

export type EventContractCode =
  | 'invalid-event-id'
  | 'invalid-event-shape'
  | 'invalid-sequence'
  | 'non-json-payload'
  | 'unknown-event-type';

export class DomainEventContractError extends Error {
  readonly code: EventContractCode;

  constructor(code: EventContractCode, message: string) {
    super(message);
    this.name = 'DomainEventContractError';
    this.code = code;
  }
}

// --- Command boundary (type-only, mirror of docs/16) -------------------------

/**
 * The real save-slot identity, resolved from WO-013's Save System for WO-002's
 * command boundary. Single source of truth: `src/domain/save` (`SaveSlotId`);
 * there is deliberately no second definition here.
 */
export type SaveSlot = SaveSlotId;

/**
 * Intent, not a fact. Commands request behavior; DomainEvents record something
 * that already happened. No dispatcher exists in WO-002 (type-only contract).
 */
export type GameCommand =
  | { type: 'interaction/use'; targetId: string }
  | { type: 'dialogue/select'; dialogueId: string; choiceId: string }
  | { type: 'inventory/equip'; itemId: string }
  | { type: 'skill/learn'; skillId: string }
  | { type: 'save/request'; slot: SaveSlot }
  | { type: 'scene/exit'; exitId: string };
