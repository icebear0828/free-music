import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface StubbedRequest {
  url: string;
}

const requests: StubbedRequest[] = [];
let respondWith: (url: string) => unknown = () => ({});

const originalXHR = (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest;

const installXhrStub = () => {
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = class {
    url = '';
    status = 200;
    readyState = 4;
    responseText = '';
    onload: (() => void) | null = null;
    onreadystatechange: (() => void) | null = null;

    open(_method: string, url: string) {
      this.url = url;
    }

    send() {
      requests.push({ url: this.url });
      this.responseText = JSON.stringify(respondWith(this.url));
      setTimeout(() => {
        if (this.onload) this.onload();
        if (this.onreadystatechange) this.onreadystatechange();
      }, 1);
    }

    setRequestHeader() {}
    getAllResponseHeaders() {
      return '';
    }
  };
};

const loadHelpers = async () => {
  vi.resetModules();
  return import('./_source-helpers.cjs');
};

describe('_source-helpers lxUrl', () => {
  beforeEach(() => {
    requests.length = 0;
    delete process.env.LX_API_URLS;
    delete process.env.LX_API_URL;
    installXhrStub();
  });

  afterEach(() => {
    (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = originalXHR;
  });

  it('returns the url the api reports', async () => {
    const helpers = await loadHelpers();
    respondWith = () => ({ code: 0, msg: 'success', url: 'http://cdn/song.mp3' });

    await expect(helpers.lxUrl('wy', '1', '320k')).resolves.toBe('http://cdn/song.mp3');
  });

  it('rejects panspace placeholders and unsuccessful responses', async () => {
    const helpers = await loadHelpers();
    respondWith = () => ({ code: 0, msg: '无法获取播放链接！', url: 'http://panspace.kuwo.cn/x.mp3' });

    await expect(helpers.lxUrl('kw', '2', '320k')).resolves.toBeNull();
  });

  it('stops calling an endpoint that reports the caller is blocked', async () => {
    const helpers = await loadHelpers();
    respondWith = () => ({ code: 1, msg: '禁止批量下载，请规范使用！' });

    await expect(helpers.lxUrl('kg', '3', '320k')).resolves.toBeNull();
    expect(requests).toHaveLength(1);

    // The breaker is open now, so a second song must not produce a second call.
    await expect(helpers.lxUrl('kg', '4', '320k')).resolves.toBeNull();
    expect(requests).toHaveLength(1);
    expect(Object.values(helpers.lxBreakerStatus())).toContain('禁止批量下载，请规范使用！');
  });

  it('tries a self-hosted endpoint before the public one', async () => {
    process.env.LX_API_URLS = 'http://127.0.0.1:9000/';
    const helpers = await loadHelpers();
    respondWith = () => ({ code: 0, url: 'http://cdn/self-hosted.mp3' });

    await expect(helpers.lxUrl('tx', '5', '320k')).resolves.toBe('http://cdn/self-hosted.mp3');
    expect(requests[0].url).toBe('http://127.0.0.1:9000/url/tx/5/320k');
  });
});

describe('_source-helpers kuwoUrl', () => {
  beforeEach(() => {
    requests.length = 0;
    installXhrStub();
  });

  afterEach(() => {
    (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = originalXHR;
  });

  it('rejects the copyright-blocked placeholder clip', async () => {
    const helpers = await loadHelpers();
    respondWith = () => ({
      code: 200,
      data: { rid: 260839262, duration: 11, url: 'http://kw-er.kuwo.cn/blocked.mp3' },
    });

    await expect(helpers.kuwoUrl('228908', 'standard')).resolves.toBeNull();
  });

  it('accepts a real track', async () => {
    const helpers = await loadHelpers();
    respondWith = () => ({
      code: 200,
      data: { rid: 228908, duration: 269, url: 'http://kw-er.kuwo.cn/song.mp3' },
    });

    await expect(helpers.kuwoUrl('228908', 'standard')).resolves.toBe('http://kw-er.kuwo.cn/song.mp3');
  });
});

describe('_source-helpers resolveMedia preference', () => {
  beforeEach(() => {
    delete process.env.QQ_MUSIC_COOKIE;
    delete process.env.QQ_MUSIC_UIN;
    delete process.env.NETEASE_COOKIE;
    delete process.env.KUGOU_COOKIE;
  });

  afterEach(() => {
    delete process.env.QQ_MUSIC_COOKIE;
    delete process.env.QQ_MUSIC_UIN;
    delete process.env.NETEASE_COOKIE;
    delete process.env.KUGOU_COOKIE;
  });

  it('prioritizes direct resolution when platform credentials are set', async () => {
    process.env.QQ_MUSIC_COOKIE = 'uin=123456; qm_keyst=abcdef';
    const helpers = await loadHelpers();
    const directMock = vi.fn().mockResolvedValue('https://ws.stream.qqmusic.qq.com/vip-stream.flac');

    const result = await helpers.resolveMedia({
      lxSource: 'tx',
      lxId: '003testmid',
      quality: 'flac',
      refresh: true,
      direct: directMock,
    });

    expect(directMock).toHaveBeenCalled();
    expect(result.url).toBe('https://ws.stream.qqmusic.qq.com/vip-stream.flac');
  });
});

describe('_source-helpers neteaseUrl', () => {
  beforeEach(() => {
    requests.length = 0;
    installXhrStub();
  });

  afterEach(() => {
    (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = originalXHR;
  });

  it('rejects audition / free trial snippet', async () => {
    const helpers = await loadHelpers();
    respondWith = () => ({
      code: 200,
      data: [
        {
          id: 12345,
          code: 200,
          fee: 1,
          time: 30000,
          freeTrialInfo: { start: 0, end: 30 },
          url: 'http://m802.music.126.net/trial.mp3',
        },
      ],
    });

    await expect(helpers.neteaseUrl('12345', 'standard')).resolves.toBeNull();
  });

  it('accepts full track with valid url', async () => {
    const helpers = await loadHelpers();
    respondWith = () => ({
      code: 200,
      data: [
        {
          id: 12345,
          code: 200,
          fee: 0,
          time: 240000,
          url: 'http://m802.music.126.net/full.mp3',
        },
      ],
    });

    await expect(helpers.neteaseUrl('12345', 'standard')).resolves.toBe('http://m802.music.126.net/full.mp3');
  });
});

