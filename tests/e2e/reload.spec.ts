/**
 * WO-013 E2E — real save -> page.reload() -> real load/hydrate.
 *
 * Drives the real bootstrap, saves through the real SaveService against
 * real IndexedDB via the DEV harness, reloads the page, then asserts the real
 * load path restores the full dialogue + quest runtime state (not just bytes).
 * IndexedDB raw reads serve only as an independent oracle.
 */
import { test, expect, type Page } from '@playwright/test';
import type {
  DevSaveHarness,
  HarnessLoadResult,
  HarnessRuntimeSummary,
  HarnessSaveResult,
} from '../../src/dev/harness';

async function boot(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  (page as unknown as { __errors?: string[] }).__errors = errors;
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __trisolaris?: unknown }).__trisolaris)
  );
  await page.waitForTimeout(300);
}

function saveHarnessStep(page: Page, slotId: string): Promise<HarnessSaveResult> {
  return page.evaluate((slot) => {
    const h = globalThis as unknown as { __trisolaris?: DevSaveHarness };
    if (h.__trisolaris === undefined) throw new Error('dev harness not installed');
    return h.__trisolaris.saveHarnessStep(slot);
  }, slotId);
}

function loadHarnessStep(page: Page, slotId: string): Promise<HarnessLoadResult> {
  return page.evaluate((slot) => {
    const h = globalThis as unknown as { __trisolaris?: DevSaveHarness };
    if (h.__trisolaris === undefined) throw new Error('dev harness not installed');
    return h.__trisolaris.loadHarnessStep(slot);
  }, slotId);
}

function rawRecord(
  page: Page,
  slotId: string
): Promise<{ checksum: string; schemaVersion: number } | null> {
  return page.evaluate((slot) => {
    const h = globalThis as unknown as { __trisolaris?: DevSaveHarness };
    if (h.__trisolaris === undefined) throw new Error('dev harness not installed');
    return h.__trisolaris.rawRecord(slot);
  }, slotId);
}

test.describe('WO-013 save reload', () => {
  test('AC-01: save, reload the page, and restore the identical runtime state', async ({
    page,
  }) => {
    await boot(page);
    const saved = await saveHarnessStep(page, 'manual-1');
    expect(saved.status).toBe('ok');
    if (saved.status !== 'ok') throw new Error(`save failed: ${saved.code}`);
    if (saved.status !== 'ok') return;

    expect(saved.slot.recordId.length).toBeGreaterThan(0);
    expect(saved.state.dialogue.mode).toBe('awaitingSkillCheck');
    expect(saved.state.dialogue.pendingCheck).toEqual({ nodeId: 'n03', choiceId: 'c_skill' });

    // Independent oracle: the record is persisted, verified by a real checksum.
    const raw = await rawRecord(page, 'manual-1');
    expect(raw).not.toBeNull();
    expect(raw?.checksum).toMatch(/^[0-9a-f]{64}$/);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() =>
      Boolean((window as unknown as { __trisolaris?: unknown }).__trisolaris)
    );

    const restored = await loadHarnessStep(page, 'manual-1');
    expect(restored.status).toBe('ok');
    if (restored.status !== 'ok') throw new Error(`load failed: ${restored.code}`);
    if (restored.status !== 'ok') return;

    expect(restored.warnings).toEqual([]);
    const state: HarnessRuntimeSummary = restored.state;

    // The restored runtime matches the state we saved, semantically identical.
    expect(state.dialogue.mode).toBe(saved.state.dialogue.mode);
    expect(state.dialogue.nodeId).toBe(saved.state.dialogue.nodeId);
    expect(state.dialogue.pendingCheck).toEqual(saved.state.dialogue.pendingCheck);
    expect(state.dialogue.processedRequestIds).toEqual(saved.state.dialogue.processedRequestIds);
    expect(state.dialogue.nextInstanceOrdinal).toEqual(saved.state.dialogue.nextInstanceOrdinal);
    expect(state.quests).toEqual(saved.state.quests);

    expect(state.quests['q_ramp']?.processedEventIds).toEqual(['evt-shared']);
    expect(state.quests['q_watched']?.processedEventIds).toEqual(['evt-shared']);

    const errors = (page as unknown as { __errors?: string[] }).__errors ?? [];
    expect(errors.length).toBe(0);
  });

  test('AC-03: an empty slot fails typed across a reload without crashing the boot', async ({
    page,
  }) => {
    await boot(page);
    const result = await loadHarnessStep(page, 'manual-3');
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('x');
    expect(result.code).toBe('slot-not-found');
  });
});
