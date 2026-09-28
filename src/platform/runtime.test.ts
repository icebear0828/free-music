import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, getServerBase, needsServerConfig, probeServer, setServerBase } from './runtime';

describe('apiUrl', () => {
  beforeEach(() => {
    setServerBase('');
  });

  it('keeps paths relative when no backend is configured', () => {
    expect(apiUrl('/api/search?q=a')).toBe('/api/search?q=a');
  });

  it('prefixes the configured backend', () => {
    setServerBase('192.168.10.2:15000');
    expect(getServerBase()).toBe('http://192.168.10.2:15000');
    expect(apiUrl('/api/play')).toBe('http://192.168.10.2:15000/api/play');
  });

  it('strips trailing slashes and keeps an explicit scheme', () => {
    setServerBase('https://music.example.com/');
    expect(apiUrl('/api/lyric')).toBe('https://music.example.com/api/lyric');
  });

  it('joins paths that lack a leading slash', () => {
    setServerBase('http://host:1');
    expect(apiUrl('api/health')).toBe('http://host:1/api/health');
  });

  it('does not ask browser builds to configure a server', () => {
    expect(needsServerConfig()).toBe(false);
  });
});

describe('probeServer', () => {
  it('rejects an empty address without hitting the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(probeServer('   ')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('reports success when /api/health responds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await expect(probeServer('http://127.0.0.1:15000')).resolves.toBe(true);
    vi.unstubAllGlobals();
  });

  it('reports failure when the request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(probeServer('http://127.0.0.1:15000')).resolves.toBe(false);
    vi.unstubAllGlobals();
  });
});
