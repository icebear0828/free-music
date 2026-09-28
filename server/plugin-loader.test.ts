import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loadPluginModule } from './plugin-manager.js';

// Plugins are stored in a writable directory that has no node_modules of its
// own — the per-user app data directory in an installed build. Node's normal
// resolution fails there, which used to leave a packaged app with no sources
// at all, so every lookup reported "无法获取播放链接".
describe('loadPluginModule outside the project tree', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'music-plugins-'));
    writeFileSync(
      path.join(dir, 'shared.cjs'),
      `const he = require("he");
       module.exports = { decode: (s) => he.decode(s), calls: 0 };`
    );
    writeFileSync(
      path.join(dir, 'demo.cjs'),
      `const axios = require("axios");
       const shared = require("./shared.cjs");
       module.exports = {
         platform: "demo",
         hasAxios: typeof axios.get === "function",
         decoded: shared.decode("a&amp;b"),
         shared,
       };`
    );
    writeFileSync(
      path.join(dir, 'extensionless.cjs'),
      `const shared = require("./shared");
       module.exports = { shared };`
    );
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('resolves bare specifiers against the server instead of the plugin directory', () => {
    const plugin = loadPluginModule(path.join(dir, 'demo.cjs')) as Record<string, unknown>;

    expect(plugin.platform).toBe('demo');
    expect(plugin.hasAxios).toBe(true);
    expect(plugin.decoded).toBe('a&b');
  });

  it('shares one instance of a relative dependency across plugins', () => {
    const cache = new Map<string, unknown>();
    const first = loadPluginModule(path.join(dir, 'demo.cjs'), cache) as { shared: { calls: number } };
    const second = loadPluginModule(path.join(dir, 'extensionless.cjs'), cache) as {
      shared: { calls: number };
    };

    // A shared circuit breaker only works if every plugin sees the same object.
    expect(second.shared).toBe(first.shared);
  });

  it('reports a helpful error for a missing relative module', () => {
    writeFileSync(path.join(dir, 'broken.cjs'), 'require("./does-not-exist");');

    expect(() => loadPluginModule(path.join(dir, 'broken.cjs'))).toThrow(
      /Cannot find module '\.\/does-not-exist'/
    );
  });
});
