/**
 * WO-001 Integration Pipeline Smoke Test
 *
 * Verifies the integration test layer can execute in the Node/Vitest
 * environment and that the `@domain` path alias resolves when assembled
 * (module-graph wiring contract, no browser, no Phaser, no game engine).
 *
 * This asserts pipeline coupling only — it contains no game rules.
 */

import { describe, it, expect } from 'vitest';
import { asEventId, createProcessingState } from '@domain/index';

describe('WO-001 Integration Pipeline Smoke', () => {
  it('domain module graph resolves and executes in the integration environment', () => {
    const proc = createProcessingState();

    expect(proc.nextSequence).toBe(1);
    expect(asEventId('smoke_001')).toBe('smoke_001');
  });
});
