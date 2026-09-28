import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { Song, LyricLine } from '../types';
import { api, getProxiedCoverUrl } from '../services/api';
import { getLocalAudioUrl, getLocalLyrics } from '../hooks/useDownloads';

interface PlayerContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  lyrics: LyricLine[];
  showLyricsView: boolean;
  volume: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  playlist: Song[];
  currentIndex: number;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  playSong: (song: Song, list?: Song[], explicitIndex?: number, isAutoAdvance?: boolean) => Promise<void>;
  playQueueIndex: (index: number) => void;
  togglePlay: () => void;
  playNext: (autoAdvance?: boolean) => void;
  playPrev: () => void;
  setVolume: (vol: number) => void;
  setShowLyricsView: (show: boolean) => void;
  handleTimeUpdate: () => void;
  handleSeek: (percent: number) => void;
  handleEnded: () => void;
  repeatMode: 'none' | 'all' | 'one';
  setRepeatMode: (mode: 'none' | 'all' | 'one') => void;
  toggleRepeatMode: () => void;
  playError: { title: string; message: string } | null;
  clearPlayError: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

const URL_TTL_MS = 30 * 60 * 1000; // 30 mins
export const globalMediaUrlCache = new Map<string, { url: string; timestamp: number }>();
export const globalLyricsCache = new Map<string, LyricLine[]>();

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [showLyricsView, setShowLyricsView] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('all');
  const [playError, setPlayError] = useState<{ title: string; message: string } | null>(null);
  const clearPlayError = () => setPlayError(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playRequestIdRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);

  const lastProgressRef = useRef<{ time: number; timestamp: number }>({ time: 0, timestamp: Date.now() });
  const isEndingRef = useRef(false);
  const userPausedRef = useRef(false);

  // Refs to ensure event handlers always read the latest state
  const playlistRef = useRef<Song[]>(playlist);
  const currentIndexRef = useRef(currentIndex);
  const repeatModeRef = useRef(repeatMode);
  playlistRef.current = playlist;
  currentIndexRef.current = currentIndex;
  repeatModeRef.current = repeatMode;

  const toggleRepeatMode = () => {
    setRepeatMode(prev => prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none');
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      const dur = audioRef.current.duration;
      setCurrentTime(cur);
      setDuration(dur);

      if (Math.abs(cur - lastProgressRef.current.time) > 0.1) {
        lastProgressRef.current = { time: cur, timestamp: Date.now() };
      }

      // If within 0.3s of track end, trigger handleEnded directly to prevent trailing silence stall
      if (dur > 0 && cur >= dur - 0.3 && !isEndingRef.current) {
        handleEnded();
      }
    }
  };

  const handleSeek = (percent: number) => {
    if (!audioRef.current || !duration) return;
    const newTime = percent * duration;
    isEndingRef.current = false;
    lastProgressRef.current = { time: newTime, timestamp: Date.now() };
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const setVolume = (vol: number) => {
    const safeVol = Math.max(0, Math.min(1, vol));
    setVolumeState(safeVol);
    if (audioRef.current) {
      audioRef.current.volume = safeVol;
    }
  };

  const playSong = async (song: Song, list?: Song[], explicitIndex?: number, isAutoAdvance: boolean = false) => {
    const requestId = ++playRequestIdRef.current;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    isEndingRef.current = false;
    userPausedRef.current = false;
    lastProgressRef.current = { time: 0, timestamp: Date.now() };

    setCurrentSong(song);
    setIsPlaying(false); // Pause while loading
    setLyrics([]);
    
    const currentPlaylist = list || playlist;
    if (explicitIndex !== undefined) {
      if (list) setPlaylist(list);
      setCurrentIndex(explicitIndex);
    } else if (list) {
      setPlaylist(list);
      setCurrentIndex(list.findIndex(s => s.id === song.id));
    } else if (playlist.length > 0) {
      setCurrentIndex(playlist.findIndex(s => s.id === song.id));
    }

    if (!isAutoAdvance) {
      consecutiveFailuresRef.current = 0;
    }

    // Inner helper: fetch a fresh URL (ignoring any cached song.url)
    const fetchFreshUrl = async (refresh: boolean = false): Promise<string | undefined> => {
      try {
        const url = await api.getMediaUrl(song, undefined, refresh);
        if (playRequestIdRef.current !== requestId) return undefined;
        if (url) return url;
      } catch (err: unknown) {
        if (playRequestIdRef.current !== requestId) return undefined;
        // Try alternative sources
        if (song.alternativeSources && song.alternativeSources.length > 0) {
          for (const alt of song.alternativeSources) {
            if (playRequestIdRef.current !== requestId) return undefined;
            try {
              const altSong = { ...song, sourceId: alt.sourceId, raw: alt.raw };
              const altUrl = await api.getMediaUrl(altSong, undefined, refresh);
              if (playRequestIdRef.current !== requestId) return undefined;
              if (altUrl) {
                song.sourceId = alt.sourceId;
                song.raw = alt.raw;
                return altUrl;
              }
            } catch (e) {}
          }
        }
        if (playRequestIdRef.current !== requestId) return undefined;
        throw err;
      }
    };

    try {
      // 1. Prefer local offline copy
      const localUrl = await getLocalAudioUrl(song.id);
      if (playRequestIdRef.current !== requestId) return;

      // 2. Check cached URL expiration TTL (30 mins).
      // If song.url exists but has no timestamp (legacy cache from state/storage), or if timestamp is >30 mins old, invalidate it immediately.
      if (song.url && (!song.urlTimestamp || Date.now() - song.urlTimestamp > URL_TTL_MS)) {
        song.url = undefined;
        song.urlTimestamp = undefined;
      }

      // 3. Check global URL cache if not present on current song object
      if (!song.url && song.id) {
        const cached = globalMediaUrlCache.get(song.id);
        if (cached && Date.now() - cached.timestamp < URL_TTL_MS) {
          song.url = cached.url;
          song.urlTimestamp = cached.timestamp;
        }
      }

      let urlToPlay = localUrl || song.url;
      if (!urlToPlay) {
        urlToPlay = await fetchFreshUrl(false);
        if (playRequestIdRef.current !== requestId) return;
        if (urlToPlay) {
          song.url = urlToPlay;
          song.urlTimestamp = Date.now();
          if (song.id) {
            globalMediaUrlCache.set(song.id, { url: urlToPlay, timestamp: song.urlTimestamp });
          }
        }
      }

      if (playRequestIdRef.current !== requestId) return;

      // Load lyrics in the background (non-blocking)
      const loadLyrics = async () => {
        let lrc = await getLocalLyrics(song.id);
        if (playRequestIdRef.current !== requestId) return;
        if (!lrc || lrc.length === 0) {
          if (song.id && globalLyricsCache.has(song.id)) {
            lrc = globalLyricsCache.get(song.id) || null;
          }
        }
        if (!lrc || lrc.length === 0) {
          lrc = await api.getLyrics(song).catch(() => []);
          if (playRequestIdRef.current !== requestId) return;
          if (!lrc || lrc.length === 0) {
            if (song.alternativeSources && song.alternativeSources.length > 0) {
              for (const alt of song.alternativeSources) {
                if (playRequestIdRef.current !== requestId) return;
                if (alt.sourceId === song.sourceId) continue;
                try {
                  const altSong = { ...song, sourceId: alt.sourceId, raw: alt.raw };
                  const altLrc = await api.getLyrics(altSong);
                  if (playRequestIdRef.current !== requestId) return;
                  if (altLrc && altLrc.length > 0) { lrc = altLrc; break; }
                } catch (e) {}
              }
            }
          }
        }
        if (playRequestIdRef.current !== requestId) return;
        if (lrc && lrc.length > 0 && song.id) {
          globalLyricsCache.set(song.id, lrc);
        }
        setLyrics(lrc || []);
      };
      loadLyrics();

      if (audioRef.current && urlToPlay) {
        audioRef.current.src = urlToPlay;
        try {
          await audioRef.current.play();
          if (playRequestIdRef.current !== requestId) {
            audioRef.current.pause();
            return;
          }
          setIsPlaying(true);
          consecutiveFailuresRef.current = 0;
          api.recordPlay(song).catch(console.error);
        } catch (playErr: unknown) {
          if (playRequestIdRef.current !== requestId) return;
          const error = playErr as Error;
          if (error.name === 'AbortError' || error.name === 'NotAllowedError') {
            // AbortError = interrupted by a subsequent load (harmless)
            // NotAllowedError = autoplay policy (user will press play manually)
            return;
          }
          // NotSupportedError / NetworkError usually means the cached URL expired.
          // Clear it and retry once with a fresh URL.
          console.warn('[Player] Cached URL failed, fetching fresh URL for:', song.title);
          song.url = undefined; // invalidate cache
          song.urlTimestamp = undefined;
          if (song.id) {
            globalMediaUrlCache.delete(song.id);
          }
          
          try {
            const freshUrl = await fetchFreshUrl(true);
            if (playRequestIdRef.current !== requestId) return;
            if (freshUrl && audioRef.current) {
              song.url = freshUrl;
              song.urlTimestamp = Date.now();
              if (song.id) {
                globalMediaUrlCache.set(song.id, { url: freshUrl, timestamp: song.urlTimestamp });
              }
              audioRef.current.src = freshUrl;
              await audioRef.current.play();
              if (playRequestIdRef.current !== requestId) {
                audioRef.current.pause();
                return;
              }
              setIsPlaying(true);
              consecutiveFailuresRef.current = 0;
              api.recordPlay(song).catch(console.error);
              return;
            } else {
              throw new Error('Fresh URL fetch returned empty result');
            }
          } catch (retryErr) {
            if (playRequestIdRef.current !== requestId) return;
            console.error('[Player] Retry also failed:', retryErr);
            throw retryErr;
          }
        }
      }
    } catch (err: unknown) {
      if (playRequestIdRef.current !== requestId) return;
      const error = err as Error;
      song.url = undefined;
      song.urlTimestamp = undefined;
      if (song.id) {
        globalMediaUrlCache.delete(song.id);
      }

      if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
        console.error('[Player] Playback failed for track:', song.title, err);
      }

      if (isAutoAdvance) {
        consecutiveFailuresRef.current += 1;
        const maxFailures = Math.max(1, currentPlaylist.length);
        if (consecutiveFailuresRef.current < maxFailures) {
          console.warn(`[Player] Track "${song.title}" failed during auto-advance, skipping to next track (${consecutiveFailuresRef.current}/${maxFailures})...`);
          setTimeout(() => {
            if (playRequestIdRef.current === requestId) {
              playNext(true);
            }
          }, 300);
          return;
        }
      }

      setIsPlaying(false);
      setPlayError({
        title: song.title || 'Unknown',
        message: '无法获取播放链接，该歌曲在当前所有音源均不可用',
      });
    }
  };

  // handleEnded: reads from refs to always have the latest state
  const handleEnded = () => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;

    const pl = playlistRef.current;
    const idx = currentIndexRef.current;
    const mode = repeatModeRef.current;

    if (mode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => {
          setIsPlaying(true);
          isEndingRef.current = false;
          lastProgressRef.current = { time: 0, timestamp: Date.now() };
        }).catch(console.error);
      }
      return;
    }

    if (pl.length > 0 && idx < pl.length - 1) {
      playSong(pl[idx + 1], pl, idx + 1, true);
    } else if (pl.length > 0) {
      if (mode === 'all') {
        playSong(pl[0], pl, 0, true);
      } else {
        setIsPlaying(false);
      }
    }
  };

  const playNext = (autoAdvance = false) => {
    const pl = playlistRef.current;
    const idx = currentIndexRef.current;
    const mode = repeatModeRef.current;

    if (autoAdvance && mode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      }
      return;
    }

    if (pl.length > 0 && idx < pl.length - 1) {
      playSong(pl[idx + 1], pl, idx + 1, autoAdvance);
    } else if (pl.length > 0) {
      if (!autoAdvance || mode === 'all') {
        playSong(pl[0], pl, 0, autoAdvance);
      } else {
        setIsPlaying(false);
      }
    }
  };

  const playPrev = () => {
    const pl = playlistRef.current;
    const idx = currentIndexRef.current;

    if (pl.length > 0 && idx > 0) {
      playSong(pl[idx - 1], pl, idx - 1);
    } else if (pl.length > 0) {
      playSong(pl[pl.length - 1], pl, pl.length - 1);
    }
  };

  const playQueueIndex = (index: number) => {
    if (index >= 0 && index < playlist.length) {
      playSong(playlist[index], undefined, index);
    }
  };

  const togglePlay = () => {
    if (!currentSong || !audioRef.current) return;
    if (isPlaying) {
      userPausedRef.current = true;
      audioRef.current.pause();
    } else {
      userPausedRef.current = false;
      audioRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };

  const removeFromQueue = (index: number) => {
    if (index < 0 || index >= playlist.length) return;
    const newPlaylist = [...playlist];
    newPlaylist.splice(index, 1);
    setPlaylist(newPlaylist);
    if (index < currentIndex) {
      setCurrentIndex(currentIndex - 1);
    } else if (index === currentIndex) {
      if (newPlaylist.length === 0) {
        playRequestIdRef.current += 1;
        setCurrentSong(null);
        setIsPlaying(false);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
          audioRef.current.load();
        }
        setCurrentIndex(-1);
      } else {
        // play next
        const nextIndex = index >= newPlaylist.length ? 0 : index;
        playSong(newPlaylist[nextIndex], newPlaylist, nextIndex);
      }
    }
  };

  const clearQueue = () => {
    playRequestIdRef.current += 1;
    setPlaylist([]);
    setCurrentIndex(-1);
    setCurrentSong(null);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
  };

  // Lock screen / notification / headset controls. Without this the OS media
  // controls on Android and iOS show nothing while the app plays in background.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist,
      album: currentSong.album,
      artwork: currentSong.cover ? [{ src: getProxiedCoverUrl(currentSong.cover), sizes: '512x512' }] : [],
    });
  }, [currentSong]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => {
        userPausedRef.current = false;
        return audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => undefined);
      }],
      ['pause', () => {
        userPausedRef.current = true;
        audioRef.current?.pause();
        setIsPlaying(false);
      }],
      ['previoustrack', () => playPrev()],
      ['nexttrack', () => playNext()],
      ['seekto', (details) => {
        if (audioRef.current && details.seekTime !== undefined) {
          audioRef.current.currentTime = details.seekTime;
          setCurrentTime(details.seekTime);
        }
      }],
    ];
    handlers.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Not every browser implements every action.
      }
    });
    return () => {
      handlers.forEach(([action]) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // ignore
        }
      });
    };
  }, [playNext, playPrev]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.ctrlKey && e.code === 'ArrowRight') {
        e.preventDefault();
        playNext();
      } else if (e.ctrlKey && e.code === 'ArrowLeft') {
        e.preventDefault();
        playPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, playNext, playPrev]);

  // Stall / Near-End Watchdog:
  // Tracks frequently have 3 to 10 seconds of trailing silence / outro padding.
  // If playback stalls near the end (remaining <= 10s or 5% of track) for >= 2.5 seconds
  // while isPlaying is true, automatically advance to the next song.
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (!audioRef.current || isEndingRef.current) return;
      const cur = audioRef.current.currentTime;
      const dur = audioRef.current.duration;
      if (!dur || dur < 15) return;

      const stallThreshold = Math.max(8, Math.min(12, dur * 0.05));
      if (dur - cur <= stallThreshold && Date.now() - lastProgressRef.current.timestamp >= 2500) {
        console.warn(`[Player] Playback stalled near end (${cur.toFixed(1)}s / ${dur.toFixed(1)}s), auto-advancing...`);
        handleEnded();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const value = {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    lyrics,
    showLyricsView,
    volume,
    audioRef,
    playlist,
    currentIndex,
    removeFromQueue,
    clearQueue,
    playSong,
    playQueueIndex,
    togglePlay,
    playNext,
    playPrev,
    setVolume,
    setShowLyricsView,
    handleTimeUpdate,
    handleSeek,
    handleEnded,
    repeatMode,
    setRepeatMode,
    toggleRepeatMode,
    playError,
    clearPlayError,
  };

  return (
    <PlayerContext.Provider value={value}>
      {/* Owned by the provider so every shell (desktop bar, mobile mini player,
          overlay-only windows) shares one audio element. */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onPlay={() => {
          userPausedRef.current = false;
          setIsPlaying(true);
          lastProgressRef.current = {
            time: audioRef.current?.currentTime || 0,
            timestamp: Date.now(),
          };
        }}
        onPause={() => {
          setIsPlaying(false);
          if (!userPausedRef.current && audioRef.current && !isEndingRef.current) {
            const cur = audioRef.current.currentTime;
            const dur = audioRef.current.duration;
            if (dur > 15 && dur - cur <= 10) {
              console.warn(`[Player] Track auto-paused near end (${cur.toFixed(1)}s / ${dur.toFixed(1)}s), auto-advancing`);
              handleEnded();
            }
          }
        }}
        onEnded={handleEnded}
        onWaiting={() => {
          if (!audioRef.current || isEndingRef.current) return;
          const cur = audioRef.current.currentTime;
          const dur = audioRef.current.duration;
          if (dur > 15 && dur - cur <= 8 && Date.now() - lastProgressRef.current.timestamp >= 1500) {
            handleEnded();
          }
        }}
        onStalled={() => {
          if (!audioRef.current || isEndingRef.current) return;
          const cur = audioRef.current.currentTime;
          const dur = audioRef.current.duration;
          if (dur > 15 && dur - cur <= 8 && Date.now() - lastProgressRef.current.timestamp >= 1500) {
            handleEnded();
          }
        }}
      />
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}

