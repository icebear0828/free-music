import { useCallback, useMemo, useRef, useState } from 'react';
import { Playlist, Song } from '../types';
import { api, getProxiedCoverUrl } from '../services/api';
import type { DownloadedSong } from './useDownloads';

export type SortField = 'title' | 'artist' | 'duration' | 'downloadedAt' | null;
export type SearchType = 'music' | 'artist' | 'album' | 'sheet';

export const ALL_SOURCES = ['xiaoqiu', 'xiaowo', 'xiaoyun', 'xiaogou', 'xiaomi'];

const SOURCES_KEY = 'search_sources';

function loadSources(): string[] {
  try {
    const saved = localStorage.getItem(SOURCES_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    }
  } catch {
    // fall through to defaults
  }
  return ALL_SOURCES;
}

interface UseLibraryArgs {
  currentView: string;
  setView: (view: string) => void;
  playlists: Playlist[];
  downloads: DownloadedSong[];
}

/**
 * Search, sorting and remote-list state shared by the desktop table layout and
 * the mobile shell, so both surfaces stay in sync with one implementation.
 */
export function useLibrary({ currentView, setView, playlists, downloads }: UseLibraryArgs) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('music');
  const [searchResults, setSearchResults] = useState<unknown[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorString, setErrorString] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedSources, setSelectedSources] = useState<string[]>(loadSources);

  const searchAbortController = useRef<AbortController | null>(null);

  const toggleSource = useCallback((id: string) => {
    setSelectedSources((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const final = next.length > 0 ? next : prev;
      localStorage.setItem(SOURCES_KEY, JSON.stringify(final));
      return final;
    });
  }, []);

  const search = useCallback(
    async (query: string, type: SearchType = searchType) => {
      if (!query.trim()) return;

      searchAbortController.current?.abort();
      const abortController = new AbortController();
      searchAbortController.current = abortController;

      setView('search');
      setSearchType(type);
      setSearchQuery(query);
      setIsSearching(true);
      setSearchResults([]);
      setErrorString(null);
      setSortField(null);

      try {
        if (type === 'music') {
          const grouped = new Map<string, Song>();
          await api.searchStream(
            query,
            type,
            (newSongs: Song[]) => {
              let changed = false;
              newSongs.forEach((song) => {
                const key = `${song.title}-${song.artist}`.toLowerCase().replace(/\s+/g, '');
                const existing = grouped.get(key);
                if (existing) {
                  if (!existing.alternativeSources) existing.alternativeSources = [];
                  const known = existing.alternativeSources.some(
                    (s) => s.source === song.source && s.id === song.id
                  );
                  if (!known) {
                    existing.alternativeSources.push({
                      source: song.source,
                      sourceId: song.sourceId!,
                      id: song.id,
                      raw: song.raw,
                    });
                  }
                } else {
                  song.alternativeSources = [];
                  grouped.set(key, song);
                  changed = true;
                }
              });
              if (changed) setSearchResults(Array.from(grouped.values()));
            },
            abortController.signal,
            selectedSources
          );
        } else {
          const seen = new Set<string>();
          const all: unknown[] = [];
          await api.searchStream(
            query,
            type,
            (newItems: unknown[]) => {
              newItems.forEach((item) => {
                const key = (item as { id: string }).id;
                if (!seen.has(key)) {
                  seen.add(key);
                  all.push(item);
                }
              });
              setSearchResults([...all]);
            },
            abortController.signal,
            selectedSources
          );
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (error.message !== 'AbortError') {
          setErrorString(error.message || '搜索发生错误，请稍后重试');
        }
      } finally {
        if (searchAbortController.current === abortController) setIsSearching(false);
      }
    },
    [searchType, selectedSources, setView]
  );

  const loadRemoteList = useCallback(
    async (type: SearchType, sourceId: string, item: unknown) => {
      setView('remote_list');
      setIsSearching(true);
      setSearchResults([]);
      setErrorString(null);
      setSortField(null);
      try {
        let list: unknown = null;
        if (type === 'artist') list = await api.invokePluginMethod(sourceId, 'getArtistWorks', [item, 1, 'music']);
        else if (type === 'album') list = await api.invokePluginMethod(sourceId, 'getAlbumInfo', [item, 1]);
        else if (type === 'sheet') list = await api.invokePluginMethod(sourceId, 'getMusicSheetInfo', [item, 1]);

        const listRec = list as { musicList?: unknown[]; data?: unknown[] } | unknown[];
        const itemsArray = listRec
          ? (!Array.isArray(listRec) && (listRec.musicList || listRec.data)) ||
            (Array.isArray(listRec) ? listRec : [])
          : [];

        if (Array.isArray(itemsArray) && itemsArray.length > 0) {
          const itemRec = item as Record<string, unknown>;
          const mapped: Song[] = itemsArray.map((entry: unknown) => {
            const m = entry as Record<string, unknown>;
            return {
              id: String(m.id || m.songmid || m.hash || `${sourceId}-${Math.random()}`),
              title: String(m.title || m.name || 'Unknown'),
              artist: String(m.artist || m.singer || 'Unknown'),
              album: String(m.album || 'Unknown'),
              cover: getProxiedCoverUrl(
                String(
                  m.artwork || m.pic || m.coverImg || itemRec.coverImg || itemRec.avatar || itemRec.artwork || ''
                )
              ),
              duration: Number(m.duration || m.interval || m.time || m.dt || 0),
              source: sourceId,
              sourceId,
              raw: m,
            };
          });
          setSearchResults(mapped);
        } else {
          setSearchResults([]);
          setErrorString('没有找到音乐内容');
        }
      } catch (e: unknown) {
        setErrorString((e as Error).message || '加载详情失败');
      } finally {
        setIsSearching(false);
      }
    },
    [setView]
  );

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      else {
        setSortField(field);
        setSortOrder('asc');
      }
    },
    [sortField, sortOrder]
  );

  const playlistMatch = currentView.match(/^playlist_(.+)$/);
  const currentPlaylist = playlistMatch
    ? playlists.find((p) => p.id === playlistMatch[1]) ?? null
    : null;

  const activeSongs: Song[] = useMemo(() => {
    if (currentPlaylist) return currentPlaylist.items;
    if (currentView === 'downloads') return downloads;
    if (currentView === 'search' && searchType === 'music') return searchResults as Song[];
    if (currentView === 'remote_list') return searchResults as Song[];
    return [];
  }, [currentPlaylist, currentView, downloads, searchResults, searchType]);

  const sortedSongs = useMemo(() => {
    if (!sortField) return activeSongs;
    return [...activeSongs].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'duration') {
        cmp = Number(a.duration || 0) - Number(b.duration || 0);
      } else if (sortField === 'downloadedAt') {
        cmp =
          Number((a as DownloadedSong).downloadedAt || 0) -
          Number((b as DownloadedSong).downloadedAt || 0);
      } else {
        cmp = String(a[sortField] || '').localeCompare(String(b[sortField] || ''));
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [activeSongs, sortField, sortOrder]);

  const viewTitle = useMemo(() => {
    if (currentPlaylist) return currentPlaylist.name;
    if (currentView === 'downloads') return '本地下载';
    if (currentView === 'profile') return '个人中心';
    if (currentView === 'settings') return '设置';
    if (currentView === 'remote_list') return '列表详情';
    if (searchType === 'music') return '单曲搜索结果';
    if (searchType === 'artist') return '歌手搜索结果';
    if (searchType === 'album') return '专辑搜索结果';
    return '歌单搜索结果';
  }, [currentPlaylist, currentView, searchType]);

  const emptyStateText = useMemo(() => {
    if (currentPlaylist) return '歌单暂无内容';
    if (currentView === 'downloads') return '暂无下载的音乐';
    if (currentView === 'profile' || currentView === 'settings') return '';
    return '搜你想乐';
  }, [currentPlaylist, currentView]);

  return {
    searchQuery,
    setSearchQuery,
    searchType,
    setSearchType,
    searchResults,
    isSearching,
    errorString,
    selectedSources,
    toggleSource,
    search,
    loadRemoteList,
    sortField,
    sortOrder,
    handleSort,
    activeSongs,
    sortedSongs,
    viewTitle,
    emptyStateText,
    currentPlaylist,
  };
}

export type LibraryState = ReturnType<typeof useLibrary>;
