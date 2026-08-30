/**
 * Bootstrap Scene
 *
 * WO-000: Minimal scene to verify Phaser is working.
 * This scene displays a placeholder title and does NOT contain game logic.
 *
 * Architecture constraint: Scenes only render, they do not own game state.
 */

import Phaser from 'phaser';

export class BootstrapScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootstrapScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Display placeholder title
    const title = this.add.text(width / 2, height / 2, 'TRISOLARIS CHRONICLE', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });

    title.setOrigin(0.5, 0.5);

    // Add subtitle
    const subtitle = this.add.text(width / 2, height / 2 + 60, 'WO-000 Bootstrap Verified', {
      fontSize: '24px',
      color: '#888888',
      fontFamily: 'Arial, sans-serif',
    });

    subtitle.setOrigin(0.5, 0.5);

    // Log confirmation for debugging
    console.log('[BootstrapScene] Phaser canvas initialized successfully');
  }
}
