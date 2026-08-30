/**
 * Phaser Game Configuration
 *
 * WO-000: Minimal Phaser configuration for bootstrap verification.
 * This creates a simple game instance with no game logic.
 *
 * Architecture constraint: Phaser scenes do NOT own canonical game state.
 * Game state belongs in the domain layer.
 */

import Phaser from 'phaser';
import { BootstrapScene } from './scenes/BootstrapScene';

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'phaser-container',
  backgroundColor: '#0a0a1a',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootstrapScene],
};

/**
 * Creates a minimal Phaser game instance for WO-000 bootstrap.
 * This function will be expanded in future work orders to add scenes.
 */
export function createGame(): Phaser.Game {
  return new Phaser.Game(GAME_CONFIG);
}
