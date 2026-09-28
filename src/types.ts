export interface Playlist {
  id: string;
  name: string;
  items: Song[];
}

export interface Song<TRaw = unknown> {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  url?: string;
  urlTimestamp?: number;
  duration?: number;
  source: string;
  sourceId?: string;
  raw?: TRaw;
  alternativeSources?: { source: string; sourceId: string; id: string; raw: TRaw }[];
}

export interface LyricLine {
  time: number;
  text: string;
  translation?: string;
}

export interface AuthUser {
  username: string;
  nickname: string;
  avatar: string;
}

export interface AuthResponse {
  success: boolean;
  user: AuthUser;
  token?: string;
  error?: string;
}

export interface PlayStat {
  songId: string;
  sourceId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  playCount: number;
  lastPlayedAt: string;
  raw?: unknown;
}

export interface ApiSearchResult<TData = unknown> {
  success: boolean;
  results: Array<{
    sourceId: string;
    platform: string;
    data: TData[];
    error?: string;
  }>;
  error?: string;
}

export interface InternalPluginInterface {
  platform: string;
  version?: string;
  supportedSearchType?: string[];
  search: (query: string, page: number, type: string) => Promise<{ isEnd: boolean; data: unknown[] }>;
  getMediaSource: (musicItem: any, quality: string, refresh?: boolean) => Promise<{ url?: string; header?: Record<string, string> }>;
  getLyric: (musicItem: unknown) => Promise<{ lyric?: string; tlyric?: string }>;
  [key: string]: unknown;
}
