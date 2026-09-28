import path from 'path';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { logger } from './utils/logger.js';
import { BUNDLED_PLUGINS_DIR, PLUGINS_DIR } from './utils/paths.js';
import { InternalPluginInterface } from '../src/types.js';

/**
 * Plugins live in a writable directory that has no `node_modules` of its own
 * (the per-user app data directory once installed), so `require("axios")` from
 * a plugin file cannot be resolved by Node's normal lookup — it walks up from
 * the plugin's own path and finds nothing. Resolving bare specifiers against
 * this module instead lets plugins share the server's dependencies wherever
 * they happen to be stored.
 *
 * `import.meta.url` only exists when this file runs as a real ES module; the
 * packaged desktop build bundles it to CommonJS, where esbuild blanks it out
 * and the ambient `require` is the one that can see the app's dependencies.
 */
const metaUrl: string | undefined = import.meta.url;
const hostRequire: NodeRequire = typeof metaUrl === 'string' ? createRequire(metaUrl) : require;

export function loadPluginModule(filePath: string, cache = new Map<string, unknown>()): unknown {
  const resolved = path.resolve(filePath);
  if (cache.has(resolved)) return cache.get(resolved);

  const dir = path.dirname(resolved);
  const pluginRequire = (id: string): unknown => {
    if (!id.startsWith('.') && !path.isAbsolute(id)) return hostRequire(id);
    const target = path.resolve(dir, id);
    for (const candidate of [target, `${target}.cjs`, `${target}.js`]) {
      try {
        return loadPluginModule(candidate, cache);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    throw new Error(`Cannot find module '${id}' from '${resolved}'`);
  };

  const code = readFileSync(resolved, 'utf-8');
  const pluginModule: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function('require', 'module', 'exports', '__filename', '__dirname', code);
  factory(pluginRequire, pluginModule, pluginModule.exports, resolved, dir);

  cache.set(resolved, pluginModule.exports);
  return pluginModule.exports;
}

/**
 * Bump whenever the bundled plugin sources change, so an existing install
 * replaces its cached copies instead of keeping stale ones forever.
 */
const PLUGIN_BUNDLE_VERSION = '6';
const BUNDLE_STAMP_FILE = '.bundle-version';
const SHARED_PLUGIN_FILES = ['_source-helpers.cjs'];

// Pre-configured plugins
const PLUGINS_CONFIG = [
  { name: "小秋音乐", url: "https://fastly.jsdelivr.net/gh/Huibq/keep-alive/Music_Free/xiaoqiu.js", id: "xiaoqiu" },
  { name: "小蜗音乐", url: "https://fastly.jsdelivr.net/gh/Huibq/keep-alive/Music_Free/xiaowo.js", id: "xiaowo" },
  { name: "小芸音乐", url: "https://fastly.jsdelivr.net/gh/Huibq/keep-alive/Music_Free/xiaoyun.js", id: "xiaoyun" },
  { name: "小枸音乐", url: "https://fastly.jsdelivr.net/gh/Huibq/keep-alive/Music_Free/xiaogou.js", id: "xiaogou" },
  { name: "小蜜音乐", url: "https://fastly.jsdelivr.net/gh/Huibq/keep-alive/Music_Free/xiaomi.js", id: "xiaomi" }
];

class PluginManager {
  private loadedPlugins: Record<string, InternalPluginInterface> = {};

  async initialize() {
    await this.syncBundledPlugins();
    await this.ensurePlugins();
    await this.loadPlugins();
  }

  /**
   * Copy the plugins shipped with the app into the writable plugins directory.
   * Without this an installed app would download the upstream plugins instead,
   * losing every local fix — including the one that keeps all sources from
   * hammering (and getting banned by) the shared lx-music API.
   */
  private async syncBundledPlugins() {
    if (path.resolve(BUNDLED_PLUGINS_DIR) === path.resolve(PLUGINS_DIR)) return;

    await fs.mkdir(PLUGINS_DIR, { recursive: true });
    const stampPath = path.join(PLUGINS_DIR, BUNDLE_STAMP_FILE);
    let installed: string | null = null;
    try {
      installed = (await fs.readFile(stampPath, 'utf-8')).trim();
    } catch {
      installed = null;
    }
    if (installed === PLUGIN_BUNDLE_VERSION) return;

    try {
      await fs.access(BUNDLED_PLUGINS_DIR);
    } catch {
      logger.warn(`No bundled plugins at ${BUNDLED_PLUGINS_DIR} — falling back to downloads`);
      return;
    }

    const files = [...SHARED_PLUGIN_FILES, ...PLUGINS_CONFIG.map(p => `${p.id}.cjs`)];
    let copied = 0;
    for (const file of files) {
      try {
        await fs.copyFile(path.join(BUNDLED_PLUGINS_DIR, file), path.join(PLUGINS_DIR, file));
        copied++;
      } catch (error) {
        logger.warn(`No bundled copy of ${file}:`, error);
      }
    }
    if (copied > 0) {
      await fs.writeFile(stampPath, PLUGIN_BUNDLE_VERSION);
      logger.info(`Installed ${copied} bundled plugin file(s) (bundle v${PLUGIN_BUNDLE_VERSION})`);
    }
  }

  private async ensurePlugins() {
    await fs.mkdir(PLUGINS_DIR, { recursive: true });

    for (const plugin of PLUGINS_CONFIG) {
      const filePath = path.join(PLUGINS_DIR, `${plugin.id}.cjs`);
      try {
        await fs.access(filePath);
      } catch {
        logger.info(`Downloading ${plugin.name} plugin...`);
        try {
          const res = await fetch(plugin.url);
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          let code = await res.text();
          if (plugin.id === 'xiaomi') {
             code = code.replace(/data\.musics\.map/g, '(data.musics || []).map')
                        .replace(/data\.albums\.map/g, '(data.albums || []).map')
                        .replace(/data\.artists\.map/g, '(data.artists || []).map')
                        .replace(/data\.songLists\.map/g, '(data.songLists || []).map')
                        .replace(/data\.songs\.map/g, '(data.songs || []).map');
          }
          if (plugin.id === 'xiaowo') {
             code = code.replace(/res\.data\.lrclist/g, '(res.data && res.data.lrclist || [])');
             code = code.replace(/res\.data\.songs/g, '(res.data && res.data.songs || [])');
          }
          // Mock env if they use window or navigator
          const wrapped = `
            const window = { navigator: { userAgent: "Mozilla/5.0" } };
            ${code}
          `;
          await fs.writeFile(filePath, wrapped);
          logger.info(`Successfully downloaded plugin: ${plugin.name}`);
        } catch (error) {
          logger.error(`Failed to download plugin ${plugin.name}:`, error);
        }
      }
    }
  }

  private async loadPlugins() {
    // One cache per run so the plugins share a single _source-helpers instance,
    // and with it a single circuit breaker and request throttle.
    const moduleCache = new Map<string, unknown>();
    for (const plugin of PLUGINS_CONFIG) {
      const filePath = path.join(PLUGINS_DIR, `${plugin.id}.cjs`);
      try {
        const exports = loadPluginModule(filePath, moduleCache) as Record<string, unknown>;
        this.loadedPlugins[plugin.id] = (exports.default ?? exports) as InternalPluginInterface;
        logger.info(`Loaded plugin: ${plugin.name} (${plugin.id})`);
      } catch (e) {
        logger.error(`Failed to load plugin ${plugin.id}:`, e);
      }
    }
  }

  getPlugin(id: string) {
    return this.loadedPlugins[id];
  }

  getAllPlugins() {
    return Object.entries(this.loadedPlugins);
  }

  getPluginIds() {
    return Object.keys(this.loadedPlugins);
  }
}

export const pluginManager = new PluginManager();
