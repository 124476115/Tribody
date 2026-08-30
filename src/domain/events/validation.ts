/**
 * Domain Event Kernel — validation (FS-EVENTS-001)
 *
 * Structural JSON-safety and occurrence-identity checks. These guards run at
 * the kernel boundary so malformed or forged input cannot reach reducers.
 */

import {
  DomainEventContractError,
  type DomainEvent,
  type EventId,
  type JSONValue,
  type Sequence,
} from './types';
import { hasEventType, type EventTypeRegistry } from './registry';

const EVENT_ID_MAX_LENGTH = 128;
const REQUIRED_EVENT_KEYS = ['id', 'type', 'payload', 'sequence'] as const;

/**
 * Cycle-guarded JSON-safety check. Rejects non-finite numbers, functions,
 * bigint, subclasses/prototype-bearing instances (e.g. Date), cyclic graphs,
 * and `undefined` values. A shared-but-acyclic object reference is accepted.
 */
export function isJSONValue(value: unknown): value is JSONValue {
  return isJSONValueInternal(value, new Set<object>());
}

function isJSONValueInternal(value: unknown, ancestors: Set<object>): value is JSONValue {
  if (value === null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return true;
  if (type === 'number') return Number.isFinite(value);
  if (type !== 'object') return false;

  const candidate: object = value as object;
  if (ancestors.has(candidate)) return false;

  if (Array.isArray(candidate)) {
    ancestors.add(candidate);
    // Array.isArray narrows to any[], which would leak `any` into the
    // recursion, so re-type the elements explicitly.
    const elements: unknown[] = candidate as unknown[];
    const ok = elements.every((element) => isJSONValueInternal(element, ancestors));
    ancestors.delete(candidate);
    return ok;
  }

  const proto = Reflect.getPrototypeOf(candidate);
  if (proto !== Object.prototype && proto !== null) return false;

  ancestors.add(candidate);
  let ok = true;
  const record = candidate as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const element = record[key];
    if (!isJSONValueInternal(element, ancestors)) {
      ok = false;
      break;
    }
  }
  ancestors.delete(candidate);
  return ok;
}

export function assertJSONValue(value: unknown): void {
  if (!isJSONValue(value)) {
    throw new DomainEventContractError(
      'non-json-payload',
      'event payload must be a JSON-safe value'
    );
  }
}

/** Structural only: non-empty, at most 128 characters, printable ASCII. */
export function isValidEventId(value: string): value is EventId {
  if (value.length === 0 || value.length > EVENT_ID_MAX_LENGTH) return false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value.charCodeAt(i);
    if (char < 0x21 || char > 0x7e) return false;
  }
  return true;
}

export function asEventId(value: string): EventId {
  if (!isValidEventId(value)) {
    throw new DomainEventContractError(
      'invalid-event-id',
      'event id must be 1..128 printable ASCII characters'
    );
  }
  return value;
}

/** Positive integer. Logical sequence; no wall-clock authority. */
export function isValidSequence(value: number): value is Sequence {
  return Number.isInteger(value) && value >= 1;
}

export function asSequence(value: number): Sequence {
  if (!isValidSequence(value)) {
    throw new DomainEventContractError(
      'invalid-sequence',
      `sequence must be a positive integer, got ${String(value)}`
    );
  }
  return value;
}

/**
 * Cross-boundary revalidation of a complete DomainEvent (e.g. after parsing).
 * Throws DomainEventContractError on any contract violation; narrows the value
 * to DomainEvent on success.
 */
export function validateEvent(
  value: unknown,
  registry: EventTypeRegistry
): asserts value is DomainEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainEventContractError('invalid-event-shape', 'event must be a plain object');
  }
  const candidate = value as Record<string, unknown>;

  for (const key of REQUIRED_EVENT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(candidate, key)) {
      throw new DomainEventContractError(
        'invalid-event-shape',
        `event is missing required field "${key}"`
      );
    }
  }

  const id = candidate['id'];
  if (typeof id !== 'string' || !isValidEventId(id)) {
    throw new DomainEventContractError('invalid-event-id', 'event id is malformed');
  }
  const sequence = candidate['sequence'];
  if (typeof sequence !== 'number' || !isValidSequence(sequence)) {
    throw new DomainEventContractError('invalid-sequence', 'event sequence is malformed');
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
