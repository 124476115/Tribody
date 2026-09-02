/**
 * WO-002 / WO-013 seam — the WO-002 command-boundary `SaveSlot` must be exactly
 * the WO-013 `SaveSlotId` (single source of truth in `src/domain/save`), so no
 * two competing save-slot definitions survive WO-013 acceptance.
 */
import { describe, it, expect } from 'vitest';
import type { SaveSlotId } from '../../../src/domain/save';
import type { GameCommand, SaveSlot } from '../../../src/domain/events';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe('WO-013 SaveSlot seam', () => {
  it('WO-002 SaveSlot is exactly WO-013 SaveSlotId (compile-time, both directions)', () => {
    const _check: Equal<SaveSlot, SaveSlotId> = true;
    expect(_check).toBe(true);
  });

  it('save/request commands carry a real, valid slot id', () => {
    const cmd: GameCommand = { type: 'save/request', slot: 'manual-2' };
    expect(cmd.type).toBe('save/request');
    expect(cmd.slot).toBe('manual-2');
  });
});
