import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Express, Request, Response, NextFunction } from 'express';
import { pluginManager } from './plugin-manager.js';
import { logger } from './utils/logger.js';
import { Readable } from 'stream';
import { musicService, withTimeout } from './services/music-service.js';
import { dbService } from './services/db-service.js';
import { AUDIO_CACHE_DIR } from './utils/paths.js';

try {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
} catch {
  // directory may already exist
}

const PLAY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 mins
const playCache = new Map<string, { mediaRes: any; expires: number }>();

const LYRIC_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const lyricCache = new Map<string, { value: object; expires: number }>();

const activeCacheDownloads = new Set<string>();
const MAX_AUDIO_CACHE_BYTES = parseInt(process.env.MUSIC_AUDIO_CACHE_MAX_BYTES || '', 10) || 500 * 1024 * 1024; // 500MB

async function pruneAudioCache(): Promise<void> {
  try {
    const files = await fs.promises.readdir(AUDIO_CACHE_DIR);
    const binFiles = files.filter((f) => f.endsWith('.bin'));
    let totalSize = 0;
    const stats = await Promise.all(
      binFiles.map(async (file) => {
        const filePath = path.join(AUDIO_CACHE_DIR, file);
        const s = await fs.promises.stat(filePath);
        totalSize += s.size;
        return { file, filePath, size: s.size, mtime: s.mtimeMs };
      })
    );
    if (totalSize <= MAX_AUDIO_CACHE_BYTES) return;
    stats.sort((a, b) => a.mtime - b.mtime); // oldest first
    for (const item of stats) {
      if (totalSize <= MAX_AUDIO_CACHE_BYTES * 0.8) break;
      await fs.promises.unlink(item.filePath).catch(() => {});
      const metaPath = path.join(AUDIO_CACHE_DIR, item.file.replace(/\.bin$/, '.json'));
      await fs.promises.unlink(metaPath).catch(() => {});
      totalSize -= item.size;
    }
  } catch {
    // ignore
  }
}

const getUsernameFromRequest = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return dbService.verifyToken(token);
  }
  return null;
};

// Cross-source fallback used to try *every* search hit on *every* plugin for
// *every* quality — well over a hundred upstream calls for a single unplayable
// song, which is what got the shared lx-music API to ban this host. Fallbacks
// are now matched by title/artist and hard-capped.
const MAX_FALLBACK_CANDIDATES = 6;
const MAX_FALLBACK_PER_PLUGIN = 2;

const BRACKETED = /[（(【\[](.*?)[)）】\]]/g;
const ARTIST_SEPARATORS = /[/、,，&;；]|\s+feat\.?\s+|\s+ft\.?\s+|[-–—]/i;

const stripNoise = (value: string): string =>
  value
    .toLowerCase()
    .replace(BRACKETED, '')
    .replace(/[\s'"`’‘“”·・,.!?~_]/g, '');

/** Drop bracketed and dash-suffixed decorations, keeping the text readable. */
const plainName = (value?: string): string =>
  (value || '')
    .replace(BRACKETED, ' ')
    .replace(/\s*[-–—]\s*.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

// Platforms suffix titles with things like "(旧版)" or "-《英雄联盟》动画主题曲".
const normalizeTitle = (value?: string): string => stripNoise(plainName(value));

// Artist fields mix separators and nicknames ("笑看人生-李本恩", "A/B", "A、B").
// Bracketed text usually names the original artist ("冯沁苑(买辣椒也用券)"),
// so both halves count as valid names for the same song.
const artistTokens = (value?: string): string[] => {
  const raw = value || '';
  const parts = [raw.replace(BRACKETED, ' '), ...Array.from(raw.matchAll(BRACKETED), m => m[1])];
  return parts
    .flatMap(part => part.split(ARTIST_SEPARATORS))
    .map(part => stripNoise(part))
    .filter(Boolean);
};

export const isSameSong = (title: string, artist: string, candidate: any): boolean => {
  const wantedTitle = normalizeTitle(title);
  if (!wantedTitle) return false;
  const gotTitle = normalizeTitle(candidate.title || candidate.name);
  if (!gotTitle) return false;
  if (gotTitle !== wantedTitle && !gotTitle.startsWith(wantedTitle) && !wantedTitle.startsWith(gotTitle)) {
    return false;
  }
  const wanted = artistTokens(artist);
  const got = artistTokens(candidate.artist || candidate.singer);
  if (wanted.length === 0 || got.length === 0) return true;
  return wanted.some(w => got.some(g => g === w || g.includes(w) || w.includes(g)));
};

interface SourceCandidate {
  sourceId: string;
  item: any;
  origin: 'primary' | 'alternative' | 'search';
}

async function resolveMediaSource(sourceId: string, musicItem: any, quality: string, refresh = false) {
  const failedSources = new Set<string>(); // permanently failed (rate-limited, auth error, etc.)
  const attempted = new Set<string>();
  const title = musicItem.title || musicItem.name;
  const artist = musicItem.artist || musicItem.singer;

  async function tryGetUrl(
    pluginId: string,
    item: any,
    q: string,
    timeoutMs = 6000
  ): Promise<{ mediaRes: { url?: string; header?: Record<string, string> }; resolvedItem: any; resolvedSourceId: string } | null> {
    if (failedSources.has(pluginId)) return null;
    const attemptKey = `${pluginId}|${item?.id ?? item?.songmid ?? ''}|${q}`;
    if (attempted.has(attemptKey)) return null;
    attempted.add(attemptKey);
    try {
      const plugin = pluginManager.getPlugin(pluginId);
      if (!plugin?.getMediaSource) return null;
      const mediaRes = await withTimeout<{ url?: string; header?: Record<string, string> }>(
        plugin.getMediaSource(item, q, refresh),
        timeoutMs,
        `getMediaSource timeout`
      );
      if (mediaRes?.url) return { mediaRes, resolvedItem: item, resolvedSourceId: pluginId };
    } catch (err: any) {
      const msg = err.message || '';
      logger.warn(`${pluginId} failed for "${title || musicItem.id}" (q=${q}): ${msg}`);
      // Rate-limit and auth errors are permanent for this request
      const isPermanent = msg.includes('禁止') || msg.includes('批量') || msg.includes('授权') ||
        msg.includes('Forbidden') || msg.includes('401') || msg.includes('403');
      if (isPermanent) failedSources.add(pluginId);
    }
    return null;
  }

  // Qualities to try. If lossless fails everywhere, retry with standard.
  const qualitiesToTry = (quality === 'wav' || quality === 'flac') ? [quality, 'standard'] : [quality];

  const knownCandidates: SourceCandidate[] = [{ sourceId, item: musicItem, origin: 'primary' }];
  // Explicit alternative sources bundled in the music item are pre-verified
  // matches for the SAME song, so they are safe to use as-is.
  for (const alt of musicItem.alternativeSources ?? []) {
    knownCandidates.push({ sourceId: alt.sourceId, item: alt.raw || { id: alt.id }, origin: 'alternative' });
  }

  const tryCandidates = async (candidates: SourceCandidate[]) => {
    for (const q of qualitiesToTry) {
      if (q !== quality) logger.info(`Quality "${quality}" failed — retrying with "${q}"`);
      for (const candidate of candidates) {
        const res = await tryGetUrl(candidate.sourceId, candidate.item, q);
        if (!res) continue;
        if (candidate.origin !== 'primary') {
          res.resolvedItem = candidate.item.title ? candidate.item : { ...candidate.item, title, artist };
          logger.info(`${candidate.origin} source ${candidate.sourceId} succeeded (q=${q})`);
        }
        return res;
      }
    }
    return null;
  };

  const known = await tryCandidates(knownCandidates);
  if (known) return known;

  // Last resort: search the other plugins once, and only try hits that really
  // look like the same song.
  if (!title) {
    throw new Error(`Cannot play "${musicItem.id}" — no sources available`);
  }

  try {
    // Search on the plain names: decorations like "(旧版)" or a "-主题曲"
    // suffix push the other platforms towards covers and remixes instead.
    const query = `${plainName(title)} ${plainName(artist)}`.trim();
    logger.info(`Primary & alt sources failed for "${title}" — searching fallback sources for "${query}"`);
    const searchResults = await musicService.searchMusic(query, 1);
    const perPlugin: SourceCandidate[][] = [];
    for (const pluginResult of searchResults ?? []) {
      if (pluginResult.sourceId === sourceId || !Array.isArray(pluginResult.data)) continue;
      if (failedSources.has(pluginResult.sourceId)) continue;
      const matches = (pluginResult.data as any[])
        .filter(item => item && isSameSong(title, artist, item))
        .slice(0, MAX_FALLBACK_PER_PLUGIN)
        .map((item): SourceCandidate => ({ sourceId: pluginResult.sourceId, item, origin: 'search' }));
      if (matches.length > 0) perPlugin.push(matches);
    }

    // Round-robin so every platform gets a shot before any platform gets two.
    const searchCandidates: SourceCandidate[] = [];
    for (let round = 0; round < MAX_FALLBACK_PER_PLUGIN; round++) {
      for (const matches of perPlugin) {
        if (matches[round]) searchCandidates.push(matches[round]);
      }
    }

    if (searchCandidates.length > 0) {
      const found = await tryCandidates(searchCandidates.slice(0, MAX_FALLBACK_CANDIDATES));
      if (found) return found;
    }
  } catch (fallbackErr) {
    logger.warn(`Fallback search error for "${title}": ${fallbackErr}`);
  }

  throw new Error(`Cannot play "${title}" — no sources available`);
}

export function setupRoutes(app: Express) {
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      app: 'music',
      plugins: pluginManager.getPluginIds(),
      time: Date.now(),
    });
  });

  app.post('/api/log-client-error', (req: Request, res: Response) => {
    logger.error('[Client Error]:', req.body);
    res.json({ success: true });
  });
  
  app.get('/api/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query.q as string;
      const page = parseInt(req.query.page as string || '1', 10);
      const sourcesParam = req.query.sources as string | undefined;
      const sources = sourcesParam ? sourcesParam.split(',') : undefined;
      
      if (!query) {
        return res.status(400).json({ success: false, error: 'Missing search query' });
      }

      const results = await musicService.searchMusic(query, page, sources);

      res.json({ success: true, results });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/play', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sourceId, musicItem, quality, refresh } = req.body;
      
      if (!sourceId || !musicItem) {
        return res.status(400).json({ success: false, error: 'Missing sourceId or musicItem' });
      }

      const requestedQuality = quality || 'standard';
      const playCacheKey = `${sourceId}|${musicItem.id ?? musicItem.songmid ?? ''}|${requestedQuality}`;

      if (!refresh) {
        const cached = playCache.get(playCacheKey);
        if (cached && cached.expires > Date.now()) {
          return res.json({ success: true, ...cached.mediaRes });
        }
      } else {
        playCache.delete(playCacheKey);
      }

      // Use resolveMediaSource which includes fallback to alternative sources and search
      const { mediaRes } = await resolveMediaSource(sourceId as string, musicItem, requestedQuality, !!refresh);

      if (mediaRes && mediaRes.url) {
        if (playCache.size > 1000) {
          const first = playCache.keys().next().value;
          if (first) playCache.delete(first);
        }
        playCache.set(playCacheKey, { mediaRes, expires: Date.now() + PLAY_CACHE_TTL_MS });
      }

      res.json({ success: true, ...mediaRes });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/lyric', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sourceId, musicItem } = req.body;
      
      if (!sourceId || !musicItem) {
        return res.status(400).json({ success: false, error: 'Missing sourceId or musicItem' });
      }

      const lyricCacheKey = `${sourceId}|${musicItem.id ?? musicItem.songmid ?? ''}`;
      const cached = lyricCache.get(lyricCacheKey);
      if (cached && cached.expires > Date.now()) {
        return res.json({ success: true, ...cached.value });
      }

      const plugin = pluginManager.getPlugin(sourceId as string);
      if (!plugin) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      if (!plugin.getLyric) {
        return res.status(400).json({ success: false, error: 'Plugin does not support lyrics' });
      }

      const lyricRes = await withTimeout<unknown>(
        plugin.getLyric(musicItem),
        5000,
        'Lyric fetch timeout'
      ) as object;

      if (lyricRes) {
        if (lyricCache.size > 1000) {
          const first = lyricCache.keys().next().value;
          if (first) lyricCache.delete(first);
        }
        lyricCache.set(lyricCacheKey, { value: lyricRes, expires: Date.now() + LYRIC_CACHE_TTL_MS });
      }

      res.json({ success: true, ...lyricRes });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/search/stream', (req: Request, res: Response) => {
    const query = req.query.q as string;
    const page = parseInt(req.query.page as string || '1', 10);
    const type = req.query.type as string || 'music'; // use type here
    const sourcesParam = req.query.sources as string | undefined;
    const sources = sourcesParam ? sourcesParam.split(',') : undefined;
    
    if (!query) {
      res.status(400).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // Flush headers immediately to establish the SSE connection
    res.flushHeaders();
    
    const allPlugins = pluginManager.getAllPlugins();
    const activePlugins = sources && sources.length > 0
      ? allPlugins.filter(([id]) => sources.includes(id))
      : allPlugins;

    Promise.allSettled(
      activePlugins.map(async ([id, plugin]) => {
        try {
          if (!plugin.search || (!plugin.supportedSearchType?.includes(type) && type !== 'music')) {
             res.write(`data: ${JSON.stringify({ sourceId: id, error: `Search type ${type} not supported` })}\n\n`);
             return;
          }
          const pluginRes = await withTimeout<unknown>(
            plugin.search(query, page, type),
            8000,
            'Search timeout'
          ) as { data?: unknown[]; isEnd?: boolean };
          
          res.write(`data: ${JSON.stringify({
              sourceId: id,
              platform: plugin.platform || id,
              data: pluginRes?.data || [],
              isEnd: pluginRes?.isEnd
          })}\n\n`);
        } catch (e: unknown) {
             const errorMsg = e instanceof Error ? e.message : String(e);
             res.write(`data: ${JSON.stringify({ sourceId: id, error: errorMsg })}\n\n`);
        }
      })
    ).then(() => {
        res.write(`event: end\ndata: {}\n\n`);
        res.end();
    });
  });

  app.post('/api/invoke', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sourceId, method, args } = req.body;
      
      if (!sourceId || !method) {
        return res.status(400).json({ success: false, error: 'Missing sourceId or method' });
      }

      const plugin = pluginManager.getPlugin(sourceId as string);
      if (!plugin) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }

      if (typeof plugin[method] !== 'function') {
        return res.status(400).json({ success: false, error: `Method ${method} not found on plugin` });
      }

      const pluginRecord = plugin as Record<string, Function>;
      const invokeRes = await withTimeout<unknown>(
        pluginRecord[method](...args),
        15000,
        `Invoke timeout for ${method}`
      );
      
      res.json({ success: true, data: invokeRes });
    } catch (error: unknown) {
      next(error);
    }
  });

  app.get('/api/proxy', async (req: Request, res: Response, next: NextFunction) => {
    try {
      let targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      targetUrl = targetUrl.trim();
      let normalizedUrl = targetUrl;
      if (targetUrl.startsWith('//')) {
        normalizedUrl = 'https:' + targetUrl;
      } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + targetUrl;
      }

      // Check audio disk cache
      const cacheHash = crypto.createHash('sha256').update(normalizedUrl).digest('hex').slice(0, 32);
      const cacheBinPath = path.join(AUDIO_CACHE_DIR, `${cacheHash}.bin`);
      const cacheMetaPath = path.join(AUDIO_CACHE_DIR, `${cacheHash}.json`);

      let isCached = false;
      let cachedSize = 0;
      let cachedContentType = 'audio/mpeg';

      if (fs.existsSync(cacheBinPath) && fs.existsSync(cacheMetaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(cacheMetaPath, 'utf-8'));
          const stat = fs.statSync(cacheBinPath);
          if (stat.size > 0 && stat.size === meta.size) {
            isCached = true;
            cachedSize = stat.size;
            cachedContentType = meta.contentType || 'audio/mpeg';
            const now = new Date();
            fs.utimes(cacheBinPath, now, now, () => {});
          }
        } catch {
          isCached = false;
        }
      }

      if (isCached) {
        if (req.headers.range) {
          const parts = req.headers.range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : cachedSize - 1;
          const chunkSize = (end - start) + 1;
          res.status(206);
          res.set({
            'Content-Range': `bytes ${start}-${end}/${cachedSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': cachedContentType,
            'Cache-Control': 'public, max-age=31536000',
            'X-Audio-Cache': 'HIT',
          });
          fs.createReadStream(cacheBinPath, { start, end }).pipe(res);
          return;
        } else {
          res.status(200);
          res.set({
            'Accept-Ranges': 'bytes',
            'Content-Length': String(cachedSize),
            'Content-Type': cachedContentType,
            'Cache-Control': 'public, max-age=31536000',
            'X-Audio-Cache': 'HIT',
          });
          fs.createReadStream(cacheBinPath).pipe(res);
          return;
        }
      }

      // Pick a platform-appropriate Referer so CDNs don't reject the request
      let refererValue = 'https://music.163.com';
      try {
        const hostname = new URL(normalizedUrl).hostname;
        if (hostname.includes('kuwo.cn')) {
          refererValue = 'https://www.kuwo.cn';
        } else if (hostname.includes('kugou.com') || hostname.includes('kg.qq.com')) {
          refererValue = 'https://www.kugou.com';
        } else if (hostname.includes('qq.com') || hostname.includes('gtimg.cn')) {
          refererValue = 'https://y.qq.com';
        } else if (hostname.includes('migu.cn') || hostname.includes('cmvideo.cn')) {
          refererValue = 'https://music.migu.cn';
        } else if (hostname.includes('126.net') || hostname.includes('163.com') || hostname.includes('netease.com')) {
          refererValue = 'https://music.163.com';
        } else {
          refererValue = new URL(normalizedUrl).origin;
        }
      } catch (e) {
        // leave default
      }

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': refererValue,
        'Origin': refererValue,
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const response = await fetch(normalizedUrl, { headers });

      if (!response.ok && response.status !== 206) {
        return res.status(response.status).json({ error: 'Proxy request failed: ' + response.statusText });
      }

      res.status(response.status);
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
        'X-Audio-Cache': 'MISS',
      });
      
      if (response.headers.has('accept-ranges')) {
        res.set('Accept-Ranges', response.headers.get('accept-ranges') as string);
      }
      if (response.headers.has('content-range')) {
        res.set('Content-Range', response.headers.get('content-range') as string);
      }
      
      // Forward Content-Length for binary/uncompressed streams, or compute it from Content-Range for 206 responses.
      // Browsers (Chrome/Safari) require Content-Length on 206 Partial Content to cleanly detect EOF and fire 'ended'.
      const contentEncoding = response.headers.get('content-encoding');
      const isCompressed = contentEncoding && contentEncoding !== 'identity';
      const upstreamContentLength = response.headers.get('content-length');

      if (!isCompressed && upstreamContentLength) {
        res.set('Content-Length', upstreamContentLength);
      } else if (!isCompressed && response.status === 206) {
        const cr = response.headers.get('content-range');
        const match = cr?.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = parseInt(match[2], 10);
          res.set('Content-Length', String(end - start + 1));
        }
      }

      if (!response.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream<Uint8Array>);

      // Determine total size if starting from byte 0
      let totalSize = 0;
      if (response.status === 200) {
        totalSize = parseInt(response.headers.get('content-length') || '0', 10);
      } else if (response.status === 206) {
        const cr = response.headers.get('content-range') || '';
        const match = cr.match(/bytes\s+0-\d+\/(\d+)/);
        if (match) {
          totalSize = parseInt(match[1], 10);
        }
      }

      if (totalSize > 0 && !activeCacheDownloads.has(cacheHash)) {
        activeCacheDownloads.add(cacheHash);
        const tmpPath = path.join(AUDIO_CACHE_DIR, `${cacheHash}.${Date.now()}.tmp`);
        const fileStream = fs.createWriteStream(tmpPath);
        let bytesWritten = 0;

        nodeStream.on('data', (chunk: Buffer) => {
          bytesWritten += chunk.length;
          fileStream.write(chunk);
        });

        const cleanup = () => {
          activeCacheDownloads.delete(cacheHash);
          fileStream.end(() => {
            fs.unlink(tmpPath, () => {});
          });
        };

        nodeStream.on('end', () => {
          activeCacheDownloads.delete(cacheHash);
          fileStream.end(() => {
            if (bytesWritten === totalSize) {
              try {
                fs.writeFileSync(cacheMetaPath, JSON.stringify({ contentType, size: totalSize, mtime: Date.now() }));
                fs.renameSync(tmpPath, cacheBinPath);
                pruneAudioCache().catch(() => {});
              } catch {
                fs.unlink(tmpPath, () => {});
              }
            } else {
              fs.unlink(tmpPath, () => {});
            }
          });
        });

        nodeStream.on('error', cleanup);
        res.on('close', () => {
          if (bytesWritten !== totalSize && !nodeStream.readableEnded) {
            cleanup();
          }
        });
      }

      nodeStream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/download', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sourceId = req.query.sourceId as string;
      const quality = (req.query.quality as string) || 'standard';
      let filename = req.query.filename as string;
      
      if (!sourceId) {
        return res.status(400).json({ success: false, error: 'Missing sourceId' });
      }

      let musicItem: any = null;
      const musicItemRaw = req.query.musicItem as string;
      if (musicItemRaw) {
        try {
          musicItem = JSON.parse(musicItemRaw);
        } catch (e) {
          return res.status(400).json({ success: false, error: 'Invalid JSON in musicItem parameter' });
        }
      } else {
        const id = req.query.id as string;
        if (!id) {
          return res.status(400).json({ success: false, error: 'Missing musicItem or music id' });
        }
        musicItem = {
          id,
          songId: id,
          mid: req.query.mid as string || id,
          songmid: req.query.songmid as string || id,
          copyrightId: req.query.copyrightId as string || id,
          cid: req.query.cid as string || id,
          hash: req.query.hash as string || id,
          title: req.query.title as string || '',
          artist: req.query.artist as string || '',
          album: req.query.album as string || '',
        };
      }

      const { mediaRes, resolvedItem, resolvedSourceId } = await resolveMediaSource(sourceId, musicItem, quality);

      const targetUrl = mediaRes.url;
      if (!targetUrl) {
        return res.status(500).json({ success: false, error: 'Failed to resolve media URL' });
      }
      const pluginHeaders = mediaRes.header || {};

      // Prepare download filename
      if (!filename) {
        const title = resolvedItem.title || resolvedItem.name || resolvedItem.songName || '';
        const artist = resolvedItem.artist || resolvedItem.singer || '';
        if (title && artist) {
          filename = `${artist} - ${title}.mp3`;
        } else if (title) {
          filename = `${title}.mp3`;
        } else {
          filename = `${resolvedSourceId}_${resolvedItem.id || 'audio'}.mp3`;
        }
      } else if (!filename.includes('.')) {
        filename = `${filename}.mp3`;
      }

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Referer': new URL(targetUrl).origin,
        ...pluginHeaders
      };

      const response = await fetch(targetUrl, { headers });
      if (!response.ok) {
        return res.status(response.status || 500).json({ success: false, error: `Failed to fetch audio stream: ${response.statusText}` });
      }

      res.status(response.status || 200);
      
      const remoteType = response.headers.get('content-type') || 'audio/mpeg';
      const remoteLength = response.headers.get('content-length');

      res.setHeader('Content-Type', remoteType);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      
      if (remoteLength) {
        res.setHeader('Content-Length', remoteLength);
      }

      if (response.body) {
        Readable.fromWeb(response.body as import('stream/web').ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error: any) {
      next(error);
    }
  });

  app.post('/api/download', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sourceId, musicItem, quality, filename: bodyFilename } = req.body;
      const requestedQuality = quality || 'standard';
      
      if (!sourceId || !musicItem) {
        return res.status(400).json({ success: false, error: 'Missing sourceId or musicItem' });
      }

      const { mediaRes, resolvedItem, resolvedSourceId } = await resolveMediaSource(sourceId, musicItem, requestedQuality);

      const targetUrl = mediaRes.url;
      if (!targetUrl) {
        return res.status(500).json({ success: false, error: 'Failed to resolve media URL' });
      }
      const pluginHeaders = mediaRes.header || {};

      let filename = bodyFilename;
      if (!filename) {
        const title = resolvedItem.title || resolvedItem.name || resolvedItem.songName || '';
        const artist = resolvedItem.artist || resolvedItem.singer || '';
        if (title && artist) {
          filename = `${artist} - ${title}.mp3`;
        } else if (title) {
          filename = `${title}.mp3`;
        } else {
          filename = `${resolvedSourceId}_${resolvedItem.id || 'audio'}.mp3`;
        }
      } else if (!filename.includes('.')) {
        filename = `${filename}.mp3`;
      }

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Referer': new URL(targetUrl).origin,
        ...pluginHeaders
      };

      const response = await fetch(targetUrl, { headers });
      if (!response.ok) {
        return res.status(response.status || 500).json({ success: false, error: `Failed to fetch audio stream: ${response.statusText}` });
      }

      res.status(response.status || 200);
      
      const remoteType = response.headers.get('content-type') || 'audio/mpeg';
      const remoteLength = response.headers.get('content-length');

      res.setHeader('Content-Type', remoteType);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      
      if (remoteLength) {
        res.setHeader('Content-Length', remoteLength);
      }

      if (response.body) {
        Readable.fromWeb(response.body as import('stream/web').ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error: any) {
      next(error);
    }
  });

  app.get('/api/download/lyric', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sourceId = req.query.sourceId as string;
      let filename = req.query.filename as string;
      
      if (!sourceId) {
        return res.status(400).json({ success: false, error: 'Missing sourceId' });
      }

      let musicItem: any = null;
      const musicItemRaw = req.query.musicItem as string;
      if (musicItemRaw) {
        try {
          musicItem = JSON.parse(musicItemRaw);
        } catch (e) {
          return res.status(400).json({ success: false, error: 'Invalid JSON in musicItem parameter' });
        }
      } else {
        const id = req.query.id as string;
        if (!id) {
          return res.status(400).json({ success: false, error: 'Missing musicItem or music id' });
        }
        musicItem = {
          id,
          songId: id,
          mid: req.query.mid as string || id,
          songmid: req.query.songmid as string || id,
          copyrightId: req.query.copyrightId as string || id,
          cid: req.query.cid as string || id,
          hash: req.query.hash as string || id,
          title: req.query.title as string || '',
          artist: req.query.artist as string || '',
          album: req.query.album as string || '',
        };
      }

      const plugin = pluginManager.getPlugin(sourceId);
      if (!plugin) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      if (!plugin.getLyric) {
        return res.status(400).json({ success: false, error: 'Plugin does not support lyrics' });
      }

      const lyricRes = await withTimeout<any>(
        plugin.getLyric(musicItem),
        5000,
        'Lyric fetch timeout'
      );

      const rawLrc = lyricRes ? (lyricRes.rawLrc || lyricRes.lyric || lyricRes.lrc || lyricRes.lyrics || '') : '';
      
      if (!filename) {
        const title = musicItem.title || musicItem.name || musicItem.songName || '';
        const artist = musicItem.artist || musicItem.singer || '';
        if (title && artist) {
          filename = `${artist} - ${title}.lrc`;
        } else if (title) {
          filename = `${title}.lrc`;
        } else {
          filename = `${sourceId}_${musicItem.id || 'lyrics'}.lrc`;
        }
      } else if (!filename.endsWith('.lrc')) {
        filename = filename.replace(/\.[^/.]+$/, "") + '.lrc';
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(rawLrc);
    } catch (error: any) {
      next(error);
    }
  });

  app.post('/api/download/lyric', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sourceId, musicItem, filename: bodyFilename } = req.body;
      
      if (!sourceId || !musicItem) {
        return res.status(400).json({ success: false, error: 'Missing sourceId or musicItem' });
      }

      const plugin = pluginManager.getPlugin(sourceId);
      if (!plugin) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      if (!plugin.getLyric) {
        return res.status(400).json({ success: false, error: 'Plugin does not support lyrics' });
      }

      const lyricRes = await withTimeout<any>(
        plugin.getLyric(musicItem),
        5000,
        'Lyric fetch timeout'
      );

      const rawLrc = lyricRes ? (lyricRes.rawLrc || lyricRes.lyric || lyricRes.lrc || lyricRes.lyrics || '') : '';

      let filename = bodyFilename;
      if (!filename) {
        const title = musicItem.title || musicItem.name || musicItem.songName || '';
        const artist = musicItem.artist || musicItem.singer || '';
        if (title && artist) {
          filename = `${artist} - ${title}.lrc`;
        } else if (title) {
          filename = `${title}.lrc`;
        } else {
          filename = `${sourceId}_${musicItem.id || 'lyrics'}.lrc`;
        }
      } else if (!filename.endsWith('.lrc')) {
        filename = filename.replace(/\.[^/.]+$/, "") + '.lrc';
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(rawLrc);
    } catch (error: any) {
      next(error);
    }
  });

  // ==========================================
  // Auth Routes
  // ==========================================
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { username, password, nickname, avatar } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
    }
    try {
      const user = dbService.createUser(username, password, nickname, avatar);
      const token = dbService.generateToken(username);
      res.json({
        success: true,
        token,
        user: {
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
    }
    const user = dbService.getUser(username);
    if (!user || dbService.hashPassword(password) !== user.passwordHash) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }
    const token = dbService.generateToken(username);
    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        createdAt: user.createdAt
      }
    });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const username = getUsernameFromRequest(req);
    if (!username) {
      return res.status(401).json({ success: false, error: '未登录或登录已过期' });
    }
    const user = dbService.getUser(username);
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    res.json({
      success: true,
      user: {
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        createdAt: user.createdAt
      }
    });
  });

  app.post('/api/auth/update', (req: Request, res: Response) => {
    const username = getUsernameFromRequest(req);
    if (!username) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    const { nickname, avatar } = req.body;
    try {
      const user = dbService.updateUserProfile(username, { nickname, avatar });
      res.json({
        success: true,
        user: {
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // Play Statistics Routes
  // ==========================================
  app.post('/api/stats/play', (req: Request, res: Response) => {
    const username = getUsernameFromRequest(req);
    const { song } = req.body;
    if (!song || !song.id) {
      return res.status(400).json({ success: false, error: 'Missing song or song.id' });
    }
    try {
      const record = dbService.recordPlay(username, song);
      res.json({ success: true, record });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/stats/top', (req: Request, res: Response) => {
    const username = getUsernameFromRequest(req);
    if (!username) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    const limit = parseInt(req.query.limit as string || '50', 10);
    const stats = dbService.getUserStats(username, limit);
    res.json({ success: true, stats });
  });

  app.get('/api/stats/global', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string || '50', 10);
    const stats = dbService.getGlobalStats(limit);
    res.json({ success: true, stats });
  });

  app.get('/api/stats/song/:id', (req: Request, res: Response) => {
    const username = getUsernameFromRequest(req);
    const songId = req.params.id;
    const counts = dbService.getSongPlayCount(songId, username || undefined);
    res.json({ success: true, ...counts });
  });
}
