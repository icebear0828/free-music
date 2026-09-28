import { AuthResponse, AuthUser, LyricLine, PlayStat, Song } from '../types';
import { apiUrl } from '../platform/runtime';

export function getProxiedCoverUrl(url: string | undefined): string {
  const fallback = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80';
  if (!url) return fallback;
  let strUrl = String(url).trim();
  if (!strUrl) return fallback;

  if (strUrl.startsWith('//')) {
    strUrl = 'https:' + strUrl;
  }

  if (strUrl.startsWith('http://') || strUrl.startsWith('https://')) {
    if (strUrl.includes('/api/proxy?url=')) return strUrl;
    if (strUrl.includes('unsplash.com')) return strUrl;
    return apiUrl(`/api/proxy?url=${encodeURIComponent(strUrl)}`);
  }
  return strUrl;
}

class ApiServer {
  async search(query: string, sources?: string[]): Promise<Song[]> {
    const sParam = sources && sources.length > 0 ? `&sources=${encodeURIComponent(sources.join(','))}` : '';
    const res = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(query)}${sParam}`));
    if (!res.ok) throw new Error('Search request failed');
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Unknown search error');
    }

    const formattedResults: Song[] = [];
    data.results.forEach((pluginResult: { data: unknown[], platform: string, sourceId: string }) => {
      if (pluginResult.data && Array.isArray(pluginResult.data)) {
        pluginResult.data.forEach((item: unknown) => {
          const songData = item as Record<string, unknown>;
          formattedResults.push({
            id: String(songData.id || songData.songmid || songData.hash || Math.random()),
            title: String(songData.title || songData.name || 'Unknown'),
            artist: String(songData.artist || songData.singer || 'Unknown'),
            album: String(songData.album || 'Unknown'),
            cover: getProxiedCoverUrl((songData.artwork || songData.pic || songData.coverImg) as string | undefined),
            duration: Number(songData.duration || songData.interval || songData.time || songData.dt || 0),
            source: pluginResult.platform || pluginResult.sourceId,
            sourceId: pluginResult.sourceId,
            raw: songData
          });
        });
      }
    });
    
    return formattedResults;
  }

  searchStream(query: string, type: string, onData: (results: any[]) => void, signal?: AbortSignal, sources?: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const sParam = sources && sources.length > 0 ? `&sources=${encodeURIComponent(sources.join(','))}` : '';
      const eventSource = new EventSource(apiUrl(`/api/search/stream?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}${sParam}`));
      
      if (signal) {
        signal.addEventListener('abort', () => {
          eventSource.close();
          reject(new Error('AbortError'));
        });
      }

      eventSource.onmessage = (event) => {
        try {
          const pluginResult = JSON.parse(event.data);
          if (pluginResult.data && Array.isArray(pluginResult.data)) {
            if (type === 'music') {
              const formattedResults: Song[] = [];
              pluginResult.data.forEach((item: unknown) => {
                const songData = item as Record<string, unknown>;
                formattedResults.push({
                  id: String(songData.id || songData.songmid || songData.hash || Math.random()),
                  title: String(songData.title || songData.name || 'Unknown'),
                  artist: String(songData.artist || songData.singer || 'Unknown'),
                  album: String(songData.album || 'Unknown'),
                  cover: getProxiedCoverUrl((songData.artwork || songData.pic || songData.coverImg) as string | undefined),
                  duration: Number(songData.duration || songData.interval || songData.time || songData.dt || 0),
                  source: pluginResult.platform || pluginResult.sourceId,
                  sourceId: pluginResult.sourceId,
                  raw: songData
                });
              });
              onData(formattedResults);
            } else {
              // Pass raw results for artist/sheet/album, plus inject source information
              const formattedResults = pluginResult.data.map((item: unknown) => {
                const dataItem = typeof item === 'object' && item !== null ? item : {};
                return {
                  ...dataItem,
                  source: pluginResult.platform || pluginResult.sourceId,
                  sourceId: pluginResult.sourceId
                };
              });
              onData(formattedResults);
            }
          }
        } catch (e) {
          console.error('Failed to parse SSE data', e);
        }
      };

      let isResolved = false;

      eventSource.addEventListener('end', () => {
        isResolved = true;
        eventSource.close();
        resolve();
      });

      eventSource.onerror = (err) => {
        eventSource.close();
        if (!isResolved) {
          isResolved = true;
          // Resolve gracefully instead of throwing error if the stream closes unexpectedly
          resolve(); 
        }
      };
    });
  }

  async invokePluginMethod(sourceId: string, method: string, args: unknown[]): Promise<unknown> {
    const res = await fetch(apiUrl(`/api/invoke`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId, method, args })
    });
    if (!res.ok) throw new Error(`Failed to invoke ${method}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  }

  async getMediaUrl(song: Song, quality?: string, refresh: boolean = false): Promise<string> {
    const q = quality || localStorage.getItem('music_audio_quality') || 'standard';
    const payload = {
      sourceId: song.sourceId,
      musicItem: song.raw,
      quality: q,
      refresh
    };
    const res = await fetch(apiUrl(`/api/play`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error('[API] /api/play failed', res.status, 'payload:', JSON.stringify(payload));
      throw new Error('Failed to fetch media url');
    }
    const data = await res.json();
    if (data.success && data.url) {
      if (data.url.startsWith('http://') || data.url.startsWith('https://')) {
        return apiUrl(`/api/proxy?url=${encodeURIComponent(data.url)}`);
      }
      return data.url;
    }
    throw new Error(data.error || 'Media URL not found in response');
  }

  async getLyrics(song: Song): Promise<LyricLine[]> {
    const res = await fetch(apiUrl(`/api/lyric`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: song.sourceId,
        musicItem: song.raw
      })
    });
    if (!res.ok) throw new Error('Failed to fetch lyrics');
    const lrcData = await res.json();
    
    if (lrcData.success) {
      const raw = lrcData.rawLrc || lrcData.lyric || lrcData.lrc || lrcData.lyrics;
      const translationRaw = lrcData.translation || lrcData.tlyric;
      if (raw) {
        const lyricLines = this.parseLyric(raw);
        if (translationRaw) {
          const transLines = this.parseLyric(translationRaw);
          const rawTransLines = translationRaw.split('\n').filter((l: string) => l.trim().length > 0 && !l.includes('[ti:') && !l.includes('[ar:') && !l.includes('[al:') && !l.includes('[by:') && !l.includes('[offset:'));
          
          if (transLines.length > 0) {
            const usedLyrics = new Set<LyricLine>();
            for (const t of transLines) {
              let bestMatch: LyricLine | null = null;
              let minDiff = 0.5; // max 0.5s alignment window
              for (const line of lyricLines) {
                if (usedLyrics.has(line)) continue;
                const diff = Math.abs(t.time - line.time);
                if (diff < minDiff) {
                  minDiff = diff;
                  bestMatch = line;
                }
              }
              if (bestMatch) {
                bestMatch.translation = t.translation || t.text || undefined;
                if (bestMatch.translation === bestMatch.text) {
                  bestMatch.translation = undefined;
                }
                usedLyrics.add(bestMatch);
              }
            }
          } else {
            lyricLines.forEach((line, index) => {
              if (rawTransLines[index]) {
                const rawTrans = rawTransLines[index].replace(/\[.*?\]/g, '').trim();
                if (rawTrans && rawTrans !== line.text) {
                   line.translation = rawTrans;
                }
              }
            });
          }
        }
        return lyricLines;
      }
    }
    return [];
  }

  private parseLyric(lrc: string): LyricLine[] {
    const lines = lrc.split('\n');
    const result: LyricLine[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const timeExp = /\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]/g;
      const rawText = line.replace(timeExp, '').trim();
      let mainText = rawText;
      let translationText = '';
      if (rawText.includes('//')) {
        const parts = rawText.split('//');
        mainText = parts[0].trim();
        translationText = parts.slice(1).join('//').trim();
      }
      mainText = mainText.replace(/\\n/g, ' ').trim();

      let match;
      while ((match = timeExp.exec(line)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = match[3] ? parseInt(match[3], 10) : 0;
        const time = minutes * 60 + seconds + milliseconds / (match[3] && match[3].length === 3 ? 1000 : 100);
        if (mainText || translationText) {
          result.push({ time, text: mainText, translation: translationText || undefined });
        }
      }
    }
    return result.sort((a, b) => a.time - b.time);
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async register(username: string, password: string, nickname?: string, avatar?: string): Promise<AuthResponse> {
    const res = await fetch(apiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, nickname, avatar })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || '注册失败');
    }
    if (data.token) {
      localStorage.setItem('auth_token', data.token);
    }
    return data;
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || '登录失败');
    }
    if (data.token) {
      localStorage.setItem('auth_token', data.token);
    }
    return data;
  }

  logout(): void {
    localStorage.removeItem('auth_token');
  }

  async getMe(): Promise<AuthUser | null> {
    const token = localStorage.getItem('auth_token');
    if (!token) return null;
    try {
      const res = await fetch(apiUrl('/api/auth/me'), {
        method: 'GET',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('auth_token'); // Clear invalid token only on unauthorized
        }
        return null;
      }
      const data = await res.json();
      return data.success ? data.user : null;
    } catch (e) {
      return null;
    }
  }

  async updateProfile(nickname?: string, avatar?: string): Promise<AuthUser> {
    const res = await fetch(apiUrl('/api/auth/update'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ nickname, avatar })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || '更新个人资料失败');
    }
    return data.user;
  }

  async recordPlay(song: Song): Promise<void> {
    try {
      const payload = {
        song: {
          id: song.id,
          sourceId: song.sourceId,
          title: song.title,
          artist: song.artist,
          album: song.album,
          cover: song.cover,
          raw: song.raw
        }
      };
      await fetch(apiUrl('/api/stats/play'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Failed to record play stat:', e);
    }
  }

  async getTopStats(limit = 50): Promise<PlayStat[]> {
    try {
      const res = await fetch(apiUrl(`/api/stats/top?limit=${limit}`), {
        method: 'GET',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch user top stats');
      const data = await res.json();
      return data.success ? data.stats : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async getGlobalStats(limit = 50): Promise<PlayStat[]> {
    try {
      const res = await fetch(apiUrl(`/api/stats/global?limit=${limit}`), {
        method: 'GET',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch global stats');
      const data = await res.json();
      return data.success ? data.stats : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async getSongPlayCount(songId: string): Promise<{ userPlayCount: number; globalPlayCount: number }> {
    try {
      const res = await fetch(apiUrl(`/api/stats/song/${encodeURIComponent(songId)}`), {
        method: 'GET',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch song play counts');
      const data = await res.json();
      return data.success ? { userPlayCount: data.userPlayCount, globalPlayCount: data.globalPlayCount } : { userPlayCount: 0, globalPlayCount: 0 };
    } catch (e) {
      return { userPlayCount: 0, globalPlayCount: 0 };
    }
  }
}

export const api = new ApiServer();
