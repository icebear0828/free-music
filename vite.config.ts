import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const hmrPort = Number(env.HMR_PORT || 15001);
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          // The desktop lyrics overlay is its own Electron BrowserWindow, so it
          // ships as a second HTML entry rather than a route of the SPA.
          main: path.resolve(__dirname, 'index.html'),
          'desktop-lyrics': path.resolve(__dirname, 'desktop-lyrics.html'),
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR === 'true' ? false : { port: hmrPort },
      // Allow LAN access via IP address (Vite 6 blocks non-localhost hosts by default)
      allowedHosts: true,
    },
  };
});
