import 'dotenv/config';
import express from 'express';
import type { Server } from 'http';
import path from 'path';
import { setupRoutes } from './routes.js';
import { pluginManager } from './plugin-manager.js';
import { errorHandler } from './middleware/error-handler.js';
import { logger } from './utils/logger.js';
import { STATIC_DIR } from './utils/paths.js';

export interface StartServerOptions {
  port?: number;
  host?: string;
  /** Serve the built client from disk instead of running Vite in middleware mode. */
  production?: boolean;
  staticDir?: string;
}

export interface RunningServer {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

// Keep server alive on unhandled errors from plugins/external requests
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception (server kept alive):', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection (server kept alive):', reason);
});

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const port = options.port ?? parseInt(process.env.PORT || '3000', 10);
  const host = options.host ?? '0.0.0.0';
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const staticDir = options.staticDir ?? STATIC_DIR;

  const app = express();
  app.use(express.json());

  // Native shells (Capacitor WebView, Electron file://) are a different origin
  // from the API, so they need permissive CORS to reach it over the LAN.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use((req, _res, next) => {
    logger.info(`[${req.method}] ${req.url}`);
    next();
  });

  await pluginManager.initialize();
  setupRoutes(app);

  if (!production) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(staticDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(errorHandler);

  return new Promise<RunningServer>((resolve, reject) => {
    const server = app.listen(port, host);
    server.once('error', reject);
    server.once('listening', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      logger.info(`Server running on http://localhost:${actualPort}`);
      resolve({
        server,
        port: actualPort,
        url: `http://127.0.0.1:${actualPort}`,
        close: () =>
          new Promise<void>((done, fail) =>
            server.close((err) => (err ? fail(err) : done()))
          ),
      });
    });
  });
}

