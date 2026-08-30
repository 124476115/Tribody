/**
 * Domain Event Kernel — session processor (FS-EVENTS-001)
 *
 * Assigns ascending logical sequences and deduplicates by occurrence id for
 * the lifetime of a processor instance. Processing is transactional: a reducer
 * failure consumes neither the id nor the sequence.
 *
 * No persistence happens here. Save architecture is snapshot-based; there is
 * no event log and no replay hydration (see FS-EVENTS-001 architectural
 * non-goal).
 */

import {
  DomainEventContractError,
  type DraftEvent,
  type DomainEvent,
  type EventId,
  type Reducer,
} from './types';
import { hasEventType, type EventTypeRegistry } from './registry';
import { asSequence, assertJSONValue, isValidEventId } from './validation';

export interface EventProcessingState {
  readonly seenIds: ReadonlySet<EventId>;
  readonly nextSequence: number;
}

export function createProcessingState(): EventProcessingState {
  return { seenIds: new Set<EventId>(), nextSequence: 1 };
}

export function hasProcessed(process: EventProcessingState, id: EventId): boolean {
  return process.seenIds.has(id);
}

export interface ProcessOk<S> {
  ok: true;
  state: S;
  event: DomainEvent;
  process: EventProcessingState;
}

export interface ProcessDuplicate {
  ok: false;
  reason: 'duplicate-id';
  eventId: EventId;
}

export type ProcessResult<S> = ProcessOk<S> | ProcessDuplicate;

const DRAFT_REQUIRED_FIELDS = ['id', 'type', 'payload'] as const;

function assertValidDraft(
  value: unknown,
  registry: EventTypeRegistry
): asserts value is DraftEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainEventContractError('invalid-event-shape', 'draft event must be a plain object');
  }
  const candidate = value as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(candidate, 'sequence')) {
    throw new DomainEventContractError(
      'invalid-event-shape',
      'draft event must not carry a caller-supplied sequence'
    );
  }
  for (const field of DRAFT_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(candidate, field)) {
      throw new DomainEventContractError(
        'invalid-event-shape',
        `draft event is missing required field "${field}"`
      );
    }
  }

  const id = candidate['id'];
  if (typeof id !== 'string' || !isValidEventId(id)) {
    throw new DomainEventContractError('invalid-event-id', 'draft event id is malformed');
  }
  const type = candidate['type'];
  if (typeof type !== 'string' || type.length === 0) {
    throw new DomainEventContractError(
      'invalid-event-shape',
      'event type must be a non-empty string'
    );
  }
  if (!hasEventType(registry, type)) {
    throw new DomainEventContractError(
      'unknown-event-type',
      `event type "${type}" is not registered`
    );
  }
  assertJSONValue(candidate['payload']);
}

/**
 * Transactional processing step: validate -> dedup check -> construct the
 * sequenced event -> run the reducer -> commit. Any validation failure or
 * reducer throw leaves the caller's processing state and domain state
 * untouched, and never consumes the id or the sequence.
 */
export function processEvent<S>(
  process: EventProcessingState,
  state: S,
  draft: DraftEvent,
  registry: EventTypeRegistry,
  reducer: Reducer<S>
): ProcessResult<S> {
  assertValidDraft(draft, registry);

  if (process.seenIds.has(draft.id)) {
    return { ok: false, reason: 'duplicate-id', eventId: draft.id };
  }

  const event: DomainEvent = Object.freeze({
    id: draft.id,
    type: draft.type,
    payload: draft.payload,
    sequence: asSequence(process.nextSequence),
  });

  const nextState = reducer(state, event);

  const nextSeenIds = new Set<EventId>(process.seenIds);
  nextSeenIds.add(event.id);

  return {
    ok: true,
    state: nextState,
    event,
    process: { seenIds: nextSeenIds, nextSequence: process.nextSequence + 1 },
  };
}

/**
 * Single-step, pure application of one event to one state. No dedup, no
 * sequence logic, no hydration — this is not a replay primitive.
 */
export function applyReducer<S>(state: S, event: DomainEvent, reducer: Reducer<S>): S {
  return reducer(state, event);
}
