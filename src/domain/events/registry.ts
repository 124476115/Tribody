/**
 * Domain Event Kernel — event type registry (FS-EVENTS-001)
 *
 * A registry of the semantic categories the kernel is allowed to process.
 * Unregistered types are rejected before any reducer runs (fail-fast).
 */

import { DomainEventContractError, type EventType } from './types';

export type EventTypeRegistry = ReadonlySet<EventType>;

export function createEventTypeRegistry(types: readonly EventType[]): EventTypeRegistry {
  const registry = new Set<EventType>(types);
  for (const type of registry) {
    if (type.length === 0) {
      throw new DomainEventContractError(
        'invalid-event-shape',
        'event type must be a non-empty string'
      );
    }
  }
  return registry;
}

export function hasEventType(registry: EventTypeRegistry, type: EventType): boolean {
  return registry.has(type);
}
