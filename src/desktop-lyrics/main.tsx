import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopLyricsOverlay } from './DesktopLyricsOverlay';
import './overlay.css';

createRoot(document.getElementById('lyrics-root')!).render(
  <StrictMode>
    <DesktopLyricsOverlay />
  </StrictMode>
);
