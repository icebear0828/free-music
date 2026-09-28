import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupRoutes, isSameSong } from './routes';
import { pluginManager } from './plugin-manager';
import { dbService } from './services/db-service';
import { DATA_DIR } from './utils/paths';

// Mock pluginManager
vi.mock('./plugin-manager', () => ({
  pluginManager: {
    getPlugin: vi.fn(),
    getAllPlugins: vi.fn(() => []),
  }
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Routes /api/download', () => {
  let getDownloadHandler: any;
  let postDownloadHandler: any;
  let playHandler: any;
  let lyricHandler: any;
  let proxyHandler: any;
  let registerHandler: any;
  let loginHandler: any;
  let meHandler: any;
  let playStatsHandler: any;
  let topStatsHandler: any;

  const mockApp = {
    get: vi.fn((path, handler) => {
      if (path === '/api/download') getDownloadHandler = handler;
      if (path === '/api/proxy') proxyHandler = handler;
      if (path === '/api/auth/me') meHandler = handler;
      if (path === '/api/stats/top') topStatsHandler = handler;
    }),
    post: vi.fn((path, handler) => {
      if (path === '/api/download') postDownloadHandler = handler;
      if (path === '/api/play') playHandler = handler;
      if (path === '/api/lyric') lyricHandler = handler;
      if (path === '/api/auth/register') registerHandler = handler;
      if (path === '/api/auth/login') loginHandler = handler;
      if (path === '/api/stats/play') playStatsHandler = handler;
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clean data files
    const fs = require('fs');
    const path = require('path');
    const uFile = path.join(DATA_DIR, 'users.test.json');
    const pFile = path.join(DATA_DIR, 'play-stats.test.json');
    try { if (fs.existsSync(uFile)) fs.unlinkSync(uFile); } catch (e) {}
    try { if (fs.existsSync(pFile)) fs.unlinkSync(pFile); } catch (e) {}
    (dbService as any).loadData();
    setupRoutes(mockApp);
  });

  describe('GET /api/download', () => {
    it('should return 400 if sourceId is missing', async () => {
      const req = {
        query: { quality: 'standard' }
      } as any;
      
      let statusCode = 0;
      let jsonBody: any = null;
      const res = {
        status: vi.fn().mockImplementation((code) => {
          statusCode = code;
          return res;
        }),
        json: vi.fn().mockImplementation((body) => {
          jsonBody = body;
          return res;
        })
      } as any;
      const next = vi.fn();

      await getDownloadHandler(req, res, next);

      expect(statusCode).toBe(400);
      expect(jsonBody.success).toBe(false);
      expect(jsonBody.error).toBe('Missing sourceId');
    });

    it('should return 400 if musicItem and id are missing', async () => {
      const req = {
        query: { sourceId: 'xiaoyun' }
      } as any;

      let statusCode = 0;
      let jsonBody: any = null;
      const res = {
        status: vi.fn().mockImplementation((code) => {
          statusCode = code;
          return res;
        }),
        json: vi.fn().mockImplementation((body) => {
          jsonBody = body;
          return res;
        })
      } as any;
      const next = vi.fn();

      await getDownloadHandler(req, res, next);

      expect(statusCode).toBe(400);
      expect(jsonBody.success).toBe(false);
      expect(jsonBody.error).toBe('Missing musicItem or music id');
    });

    it('should trigger direct file streaming with custom headers', async () => {
      const req = {
        query: {
          sourceId: 'xiaoyun',
          id: 'test-song-abc',
          title: '晴天',
          artist: '周杰伦'
        }
      } as any;

      const mockPlugin = {
        getMediaSource: vi.fn().mockResolvedValue({
          url: 'https://test-music-cdn.com/stream.mp3',
          header: { 'X-Custom-Auth': 'SecretSession' }
        })
      };
      vi.mocked(pluginManager.getPlugin).mockReturnValue(mockPlugin as any);

      // Web ReadableStream mock
      const mockStream = {
        pipe: vi.fn()
      };

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((name) => {
            if (name === 'content-type') return 'audio/mpeg';
            if (name === 'content-length') return '5000000';
            return null;
          })
        },
        body: mockStream
      };
      mockFetch.mockResolvedValue(mockResponse);

      let statusCode = 0;
      const resHeaders: Record<string, string> = {};
      const res = {
        status: vi.fn().mockImplementation((code) => {
          statusCode = code;
          return res;
        }),
        setHeader: vi.fn().mockImplementation((name, value) => {
          resHeaders[name.toLowerCase()] = String(value);
          return res;
        }),
        end: vi.fn()
      } as any;
      const next = vi.fn();

      await getDownloadHandler(req, res, next);

      expect(pluginManager.getPlugin).toHaveBeenCalledWith('xiaoyun');
      expect(mockPlugin.getMediaSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-song-abc',
          title: '晴天',
          artist: '周杰伦'
        }),
        'standard',
        expect.any(Boolean)
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-music-cdn.com/stream.mp3',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Auth': 'SecretSession',
            'Referer': 'https://test-music-cdn.com'
          })
        })
      );

      expect(resHeaders['content-type']).toBe('audio/mpeg');
      expect(resHeaders['content-length']).toBe('5000000');
      expect(resHeaders['content-disposition']).toContain("filename*=UTF-8''%E5%91%A8%E6%9D%B0%E4%BC%A6%20-%20%E6%99%B4%E5%A4%A9.mp3");
    });
  });

  describe('POST /api/download', () => {
    it('should return 400 if sourceId is missing in request body', async () => {
      const req = {
        body: { quality: 'standard' }
      } as any;

      let statusCode = 0;
      let jsonBody: any = null;
      const res = {
        status: vi.fn().mockImplementation((code) => {
          statusCode = code;
          return res;
        }),
        json: vi.fn().mockImplementation((body) => {
          jsonBody = body;
          return res;
        })
      } as any;
      const next = vi.fn();

      await postDownloadHandler(req, res, next);

      expect(statusCode).toBe(400);
      expect(jsonBody.success).toBe(false);
      expect(jsonBody.error).toBe('Missing sourceId or musicItem');
    });
  });
});

describe('Auth and Stats API Endpoints', () => {
  let registerHandler: any;
  let loginHandler: any;
  let meHandler: any;
  let playStatsHandler: any;
  let topStatsHandler: any;

  const mockApp = {
    get: vi.fn((path, handler) => {
      if (path === '/api/auth/me') meHandler = handler;
      if (path === '/api/stats/top') topStatsHandler = handler;
    }),
    post: vi.fn((path, handler) => {
      if (path === '/api/auth/register') registerHandler = handler;
      if (path === '/api/auth/login') loginHandler = handler;
      if (path === '/api/stats/play') playStatsHandler = handler;
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clean data files
    const fs = require('fs');
    const path = require('path');
    const uFile = path.join(DATA_DIR, 'users.test.json');
    const pFile = path.join(DATA_DIR, 'play-stats.test.json');
    if (fs.existsSync(uFile)) fs.unlinkSync(uFile);
    if (fs.existsSync(pFile)) fs.unlinkSync(pFile);
    (dbService as any).loadData();
    setupRoutes(mockApp);
  });

  it('should register a new user, login, and verify profile', async () => {
    // 1. Test Register
    const registerReq = {
      body: { username: 'testuser2', password: 'password123', nickname: 'Testy', avatar: '' }
    } as any;
    let regStatus = 0;
    let regJson: any = null;
    const regRes = {
      status: vi.fn().mockImplementation((code) => { regStatus = code; return regRes; }),
      json: vi.fn().mockImplementation((body) => { regJson = body; return regRes; })
    } as any;
    await registerHandler(registerReq, regRes, vi.fn());

    expect(regJson.success).toBe(true);
    expect(regJson.token).toBeDefined();
    expect(regJson.user.username).toBe('testuser2');
    expect(regJson.user.nickname).toBe('Testy');

    const token = regJson.token;

    // 2. Test Login
    const loginReq = {
      body: { username: 'testuser2', password: 'password123' }
    } as any;
    let logStatus = 0;
    let logJson: any = null;
    const logRes = {
      status: vi.fn().mockImplementation((code) => { logStatus = code; return logRes; }),
      json: vi.fn().mockImplementation((body) => { logJson = body; return logRes; })
    } as any;
    await loginHandler(loginReq, logRes, vi.fn());

    expect(logJson.success).toBe(true);
    expect(logJson.token).toBeDefined();
    expect(logJson.user.username).toBe('testuser2');

    // 3. Test Me Profile Retrieve
    const meReq = {
      headers: { authorization: `Bearer ${token}` }
    } as any;
    let meStatus = 0;
    let meJson: any = null;
    const meRes = {
      status: vi.fn().mockImplementation((code) => { meStatus = code; return meRes; }),
      json: vi.fn().mockImplementation((body) => { meJson = body; return meRes; })
    } as any;
    await meHandler(meReq, meRes, vi.fn());

    expect(meJson.success).toBe(true);
    expect(meJson.user.username).toBe('testuser2');
    expect(meJson.user.nickname).toBe('Testy');
  });

  it('should track play stats and retrieve user top list', async () => {
    // Register user to get token
    const registerReq = {
      body: { username: 'musicfan2', password: 'password123', nickname: 'Fan', avatar: '' }
    } as any;
    let regJson: any = null;
    const regRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockImplementation((body) => { regJson = body; return regRes; })
    } as any;
    await registerHandler(registerReq, regRes, vi.fn());
    const token = regJson.token;

    // 1. Play Song (Anonymous/Guest)
    const playReqGuest = {
      headers: {},
      body: { song: { id: 'songA', sourceId: 'xiaoyun', title: 'Song A', artist: 'Artist X' } }
    } as any;
    let playJsonGuest: any = null;
    const playResGuest = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockImplementation((body) => { playJsonGuest = body; return playResGuest; })
    } as any;
    await playStatsHandler(playReqGuest, playResGuest, vi.fn());
    expect(playJsonGuest.success).toBe(true);
    expect(playJsonGuest.record.playCount).toBe(1);

    // 2. Play Song (Logged in)
    const playReqUser = {
      headers: { authorization: `Bearer ${token}` },
      body: { song: { id: 'songB', sourceId: 'xiaoyun', title: 'Song B', artist: 'Artist Y' } }
    } as any;
    let playJsonUser: any = null;
    const playResUser = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockImplementation((body) => { playJsonUser = body; return playResUser; })
    } as any;
    await playStatsHandler(playReqUser, playResUser, vi.fn());
    await playStatsHandler(playReqUser, playResUser, vi.fn()); // Play twice

    expect(playJsonUser.success).toBe(true);
    expect(playJsonUser.record.playCount).toBe(2);

    // 3. Get User Top Stats
    const statsReq = {
      headers: { authorization: `Bearer ${token}` },
      query: { limit: '10' }
    } as any;
    let statsJson: any = null;
    const statsRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockImplementation((body) => { statsJson = body; return statsRes; })
    } as any;
    await topStatsHandler(statsReq, statsRes, vi.fn());

    expect(statsJson.success).toBe(true);
    expect(statsJson.stats.length).toBe(1);
    expect(statsJson.stats[0].songId).toBe('songB');
    expect(statsJson.stats[0].playCount).toBe(2);
  });
});

// The cross-source fallback only tries candidates this matcher accepts. Too
// strict and a playable copy on another platform is never found; too loose and
// the player silently swaps in a cover or a remix.
describe('isSameSong', () => {
  it('ignores version suffixes the platforms add to titles', () => {
    expect(isSameSong('起风了', '买辣椒也用券', { title: '起风了 (旧版)', artist: '买辣椒也用券' })).toBe(true);
    expect(isSameSong('孤勇者', '陈奕迅', {
      title: '孤勇者-《英雄联盟：双城之战》动画剧集中文主题曲',
      artist: '陈奕迅',
    })).toBe(true);
  });

  it('accepts an original artist named in brackets', () => {
    expect(isSameSong('起风了', '买辣椒也用券', { title: '起风了', artist: '冯沁苑(买辣椒也用券)' })).toBe(true);
    expect(isSameSong('葬花', '李本恩', { title: '葬花', artist: '笑看人生-李本恩' })).toBe(true);
  });

  it('accepts one matching artist out of several', () => {
    expect(isSameSong('小酒窝', '林俊杰', { title: '小酒窝', artist: '林俊杰/蔡卓妍' })).toBe(true);
  });

  it('reads the singer field when there is no artist field', () => {
    expect(isSameSong('晴天', '周杰伦', { name: '晴天', singer: '周杰伦' })).toBe(true);
  });

  it('rejects a different song by the same artist', () => {
    expect(isSameSong('晴天', '周杰伦', { title: '稻香', artist: '周杰伦' })).toBe(false);
  });

  it('rejects a cover by someone else', () => {
    expect(isSameSong('晴天', '周杰伦', { title: '晴天', artist: '刘大壮' })).toBe(false);
  });

  it('rejects candidates with no usable title', () => {
    expect(isSameSong('晴天', '周杰伦', { artist: '周杰伦' })).toBe(false);
    expect(isSameSong('', '周杰伦', { title: '晴天', artist: '周杰伦' })).toBe(false);
  });

  it('falls back to the title alone when an artist is unknown', () => {
    expect(isSameSong('晴天', '', { title: '晴天', artist: '周杰伦' })).toBe(true);
    expect(isSameSong('晴天', '周杰伦', { title: '晴天' })).toBe(true);
  });
});

describe('Caching in /api/play, /api/lyric, and /api/proxy', () => {
  let playHandler: any;
  let lyricHandler: any;
  let proxyHandler: any;

  const mockApp = {
    get: vi.fn((path, handler) => {
      if (path === '/api/proxy') proxyHandler = handler;
    }),
    post: vi.fn((path, handler) => {
      if (path === '/api/play') playHandler = handler;
      if (path === '/api/lyric') lyricHandler = handler;
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    setupRoutes(mockApp);
  });

  it('caches /api/play responses and supports refresh=true bypass', async () => {
    const mockPlugin = {
      getMediaSource: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/play-1.mp3' }),
    };
    vi.mocked(pluginManager.getPlugin).mockReturnValue(mockPlugin as any);

    const req1 = {
      body: {
        sourceId: 'xiaoyun',
        musicItem: { id: 'cache-song-1', title: 'Song 1', artist: 'Artist 1' },
        quality: 'standard',
        refresh: false,
      },
    } as any;

    let resData: any = null;
    const res1 = {
      json: vi.fn((data) => {
        resData = data;
        return res1;
      }),
      status: vi.fn(() => res1),
    } as any;

    // First call: calls plugin
    await playHandler(req1, res1, vi.fn());
    expect(resData.success).toBe(true);
    expect(resData.url).toBe('https://cdn.example.com/play-1.mp3');
    expect(mockPlugin.getMediaSource).toHaveBeenCalledTimes(1);

    // Second call with same item: returns cached response, does not call plugin
    const res2 = {
      json: vi.fn((data) => {
        resData = data;
        return res2;
      }),
      status: vi.fn(() => res2),
    } as any;
    await playHandler(req1, res2, vi.fn());
    expect(resData.success).toBe(true);
    expect(resData.url).toBe('https://cdn.example.com/play-1.mp3');
    expect(mockPlugin.getMediaSource).toHaveBeenCalledTimes(1); // Still 1!

    // Third call with refresh=true: bypasses cache and calls plugin
    const reqRefresh = {
      body: {
        ...req1.body,
        refresh: true,
      },
    } as any;
    mockPlugin.getMediaSource.mockResolvedValueOnce({ url: 'https://cdn.example.com/play-refreshed.mp3' });
    await playHandler(reqRefresh, res2, vi.fn());
    expect(mockPlugin.getMediaSource).toHaveBeenCalledTimes(2);
    expect(resData.url).toBe('https://cdn.example.com/play-refreshed.mp3');
  });

  it('caches /api/lyric responses and reuses them on subsequent requests', async () => {
    const mockPlugin = {
      getLyric: vi.fn().mockResolvedValue({ lyric: '[00:00.00] Hello lyric' }),
    };
    vi.mocked(pluginManager.getPlugin).mockReturnValue(mockPlugin as any);

    const req = {
      body: {
        sourceId: 'xiaoyun',
        musicItem: { id: 'lyric-song-1' },
      },
    } as any;

    let resData: any = null;
    const res = {
      json: vi.fn((data) => {
        resData = data;
        return res;
      }),
      status: vi.fn(() => res),
    } as any;

    // First call
    await lyricHandler(req, res, vi.fn());
    expect(mockPlugin.getLyric).toHaveBeenCalledTimes(1);
    expect(resData.lyric).toBe('[00:00.00] Hello lyric');

    // Second call: should hit cache
    await lyricHandler(req, res, vi.fn());
    expect(mockPlugin.getLyric).toHaveBeenCalledTimes(1); // Still 1!
  });

  it('caches audio stream on disk in /api/proxy and serves subsequent requests from disk cache', async () => {
    const testAudioData = Buffer.from('RIFF....WAVEfmt ....data....');
    const audioUrl = `https://cdn.example.com/stream-cached-test-${Date.now()}-${Math.random()}.mp3`;

    // Mock first upstream fetch response
    const { Readable } = await import('stream');
    const webStream = Readable.toWeb(Readable.from([testAudioData]));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn((header) => {
          if (header === 'content-type') return 'audio/mpeg';
          if (header === 'content-length') return String(testAudioData.length);
          return null;
        }),
        has: vi.fn((header) => header === 'accept-ranges'),
      },
      body: webStream,
    });

    const req1 = {
      query: { url: audioUrl },
      headers: {},
    } as any;

    const headers1: Record<string, string> = {};
    const res1 = {
      status: vi.fn(() => res1),
      set: vi.fn((h) => {
        Object.assign(headers1, h);
        return res1;
      }),
      end: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      write: vi.fn(),
    } as any;

    await proxyHandler(req1, res1, vi.fn());
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(headers1['X-Audio-Cache']).toBe('MISS');

    // Wait briefly for disk write and rename to settle
    await new Promise((r) => setTimeout(r, 100));

    // Second request: should hit disk cache (X-Audio-Cache: HIT) without calling fetch
    const headers2: Record<string, string> = {};
    const res2 = {
      status: vi.fn(() => res2),
      set: vi.fn((h) => {
        Object.assign(headers2, h);
        return res2;
      }),
      end: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      write: vi.fn(),
    } as any;

    await proxyHandler(req1, res2, vi.fn());
    expect(mockFetch).toHaveBeenCalledTimes(1); // No new fetch!
    expect(headers2['X-Audio-Cache']).toBe('HIT');
    expect(headers2['Content-Length']).toBe(String(testAudioData.length));
  });
});
