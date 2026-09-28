import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {isNative} from './platform/runtime';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Only the browser build benefits from the service worker: Electron serves the
// app from its own embedded server and Capacitor from the app bundle, where a
// stale cache would only get in the way of updates.
if (!isNative && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.update();
      if (registration.waiting) {
        registration.waiting.postMessage('SKIP_WAITING');
      }
    }).catch(() => undefined);
  });
}
