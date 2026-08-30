/**
 * WO-000 Domain Smoke Test
 *
 * Verifies the domain layer can be imported and executed with no framework
 * dependencies (no Phaser, no React) and that the FS-EVENTS-001 kernel is
 * reachable through the public @domain surface.
 *
 * This test MUST run in Node.js environment without a browser.
 */

import { describe, it, expect } from 'vitest';
import { asEventId, createEventTypeRegistry, createProcessingState } from '@domain/index';

describe('WO-000 Domain Smoke', () => {
  it('AC-002: domain layer is framework-independent and executes headless', () => {
    const proc = createProcessingState();

    expect(proc.nextSequence).toBe(1);
    expect(proc.seenIds.size).toBe(0);
  });

  it('domain layer exposes the event kernel through the public alias', () => {
    expect(typeof asEventId).toBe('function');
    expect(typeof createProcessingState).toBe('function');
    expect(createEventTypeRegistry(['smoke.type']).has('smoke.type')).toBe(true);
    expect(asEventId('smoke_id_001')).toBe('smoke_id_001');
  });
});
