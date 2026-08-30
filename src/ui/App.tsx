/**
 * React App Component
 *
 * WO-000: Root React component that renders the game overlay.
 * This component will be expanded in future work orders to include menus, HUD, etc.
 */

import React from 'react';
import { Overlay } from './Overlay';

export const App: React.FC = () => {
  return <Overlay />;
};
