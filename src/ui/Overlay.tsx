/**
 * React Overlay Component
 *
 * WO-000: Minimal React overlay to verify React is working.
 * This component displays placeholder text and does NOT contain game logic.
 *
 * Architecture constraint: UI components send commands, they do not mutate domain state directly.
 */

import React from 'react';

export const Overlay: React.FC = () => {
  return (
    <div
      data-testid="react-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none', // Allow clicks to pass through to Phaser canvas
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
        color: '#ffffff',
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          padding: '10px 20px',
          borderRadius: '4px',
          marginBottom: '10px',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>SYSTEM ONLINE</div>
        <div style={{ fontSize: '12px', color: '#888888' }}>WO-000 Bootstrap</div>
      </div>
    </div>
  );
};
