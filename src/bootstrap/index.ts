/**
 * Bootstrap Entry Point
 *
 * WO-000: Initializes both Phaser game and React overlay.
 * This module is responsible ONLY for wiring together the architecture layers.
 *
 * Architecture constraints:
 * - Bootstrap does NOT contain game rules
 * - Bootstrap does NOT own game state
 * - Bootstrap ONLY coordinates initialization
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { createGame } from '@game/config';
import { App } from '@ui/App';

/**
 * Initialize the game application.
 * Creates Phaser game instance and React overlay.
 */
export function initializeGame(): void {
  // Create Phaser game instance (canvas rendering)
  const game = createGame();

  // Create React overlay root
  const overlayContainer = document.getElementById('react-overlay');

  if (!overlayContainer) {
    throw new Error(
      'React overlay container not found. Ensure index.html has <div id="react-overlay">'
    );
  }

  // Mount React application
  const root = ReactDOM.createRoot(overlayContainer);
  root.render(React.createElement(React.StrictMode, null, React.createElement(App)));

  // Log successful initialization
  console.log('[Bootstrap] Game initialized successfully');
  console.log('[Bootstrap] Phaser game created');

  // Store game instance for debugging (development only)
  if (import.meta.env.DEV) {
    (window as unknown as { __GAME__: typeof game }).__GAME__ = game;
  }
}

// Auto-initialize when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
  } else {
    initializeGame();
  }
}
