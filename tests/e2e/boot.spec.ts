/**
 * WO-000 Browser Boot E2E Test
 *
 * This test verifies that the application boots correctly in a browser:
 * - Phaser Canvas is mounted
 * - React Overlay is mounted
 * - No blocking console errors
 */

import { test, expect } from '@playwright/test';

test.describe('WO-000 Browser Boot', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the dev server
    await page.goto('http://localhost:3000');
  });

  test('AC-001: Should boot and display Phaser canvas', async ({ page }) => {
    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check that a canvas element exists (Phaser creates a canvas)
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Verify canvas has reasonable dimensions
    const boundingBox = await canvas.boundingBox();
    expect(boundingBox).toBeDefined();
    if (boundingBox) {
      expect(boundingBox.width).toBeGreaterThan(0);
      expect(boundingBox.height).toBeGreaterThan(0);
    }
  });

  test('AC-001: Should display React overlay', async ({ page }) => {
    // Wait for React to render
    await page.waitForLoadState('networkidle');

    // Check for React overlay element
    // The overlay should contain placeholder text for WO-000
    const overlay = page.locator('[data-testid="react-overlay"]');
    await expect(overlay).toBeVisible({ timeout: 10000 });

    // Verify overlay contains expected placeholder content
    await expect(overlay).toContainText('SYSTEM ONLINE');
  });

  test('AC-004: Should load without blocking console errors', async ({ page }) => {
    const errors: string[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Load the page
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Wait a bit for any delayed errors
    await page.waitForTimeout(2000);

    // Filter out known non-blocking errors (e.g., browser extension errors)
    const blockingErrors = errors.filter(
      (error) =>
        !error.includes('extension') && !error.includes('Extension') && !error.includes('network') // Ignore network errors for this test
    );

    // Assert no blocking errors
    expect(blockingErrors).toHaveLength(0);
  });

  test('AC-001: Both Phaser canvas and React overlay should coexist', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Both elements should be present and visible
    const canvas = page.locator('canvas');
    const overlay = page.locator('[data-testid="react-overlay"]');

    await Promise.all([
      expect(canvas).toBeVisible({ timeout: 10000 }),
      expect(overlay).toBeVisible({ timeout: 10000 }),
    ]);

    // Verify they are both in the DOM
    const canvasCount = await canvas.count();
    const overlayCount = await overlay.count();

    expect(canvasCount).toBeGreaterThanOrEqual(1);
    expect(overlayCount).toBeGreaterThanOrEqual(1);
  });
});
