import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Song } from '../types';

// Declare hoisted state and database mock
const { dbMock, store } = vi.hoisted(() => {
  const store = new Map<string, any>();
  const dbMock = {
    keys: vi.fn(async () => Array.from(store.keys())),
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: any) => {
      store.set(key, value);
      return value;
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
  return { dbMock, store };
});

vi.mock('localforage', () => {
  return {
    default: {
      createInstance: vi.fn(() => dbMock),
    },
  };
});

// Import useDownloads after mocking localforage to prevent initialization failures
import { useDownloads, getLocalAudioUrl, getLocalLyrics } from './useDownloads';

vi.mock('../services/api', () => {
  return {
    api: {
      getMediaUrl: vi.fn(async () => 'https://mock.com/audio.mp3'),
      getLyrics: vi.fn(async () => [{ time: 1, text: 'Hello' }]),
    },
  };
});

describe('useDownloads', () => {
  let originalFetch: typeof global.fetch;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;

    // Reset store
    store.clear();
    // Clear mocks
    vi.clearAllMocks();

    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    global.alert = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('should initialize with empty downloads when DB is empty', async () => {
    const { result } = renderHook(() => useDownloads());

    // Wait for initial load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.downloads).toEqual([]);
    expect(result.current.downloadProgress).toEqual({});
  });

  it('should load downloads from database', async () => {
    const mockMeta = {
      id: 'song-1',
      title: 'Downloaded Song',
      artist: 'Artist',
      downloadedAt: Date.now(),
    };
    store.set('song_meta_song-1', mockMeta);

    const { result } = renderHook(() => useDownloads());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.downloads).toHaveLength(1);
    expect(result.current.downloads[0].id).toBe('song-1');
    expect(result.current.isDownloaded('song-1')).toBe(true);
  });

  it('should download a song successfully', async () => {
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    const mockResponse = {
      ok: true,
      headers: {
        get: vi.fn((name) => {
          if (name === 'content-length') return '3';
          if (name === 'content-type') return 'audio/mpeg';
          return null;
        }),
      },
      body: {
        getReader: () => mockReader,
      },
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse as any);

    // Mock link click inside document.createElement for test runner safety
    const originalCreateElement = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        el.click = vi.fn();
      }
      return el;
    }) as typeof document.createElement);

    const { result } = renderHook(() => useDownloads());

    // Wait for init load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const mockSong: Song = {
      id: 'download-song-1',
      title: 'Nice Song',
      artist: 'Pure Singer',
      album: 'Pure Album',
      cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
      duration: 200,
      source: '小米音乐',
      sourceId: 'xiaomi',
      raw: {},
    };

    await act(async () => {
      await result.current.downloadSong(mockSong);
    });

    expect(result.current.isDownloaded('download-song-1')).toBe(true);
    expect(store.has('song_file_download-song-1')).toBe(true);
    expect(store.has('song_meta_download-song-1')).toBe(true);
    expect(store.has('song_lyric_download-song-1')).toBe(true);

    createSpy.mockRestore();
  });

  it('should delete download successfully', async () => {
    const mockMeta = {
      id: 'song-to-delete',
      title: 'To Delete',
      artist: 'Delete Boy',
      downloadedAt: Date.now(),
    };
    store.set('song_meta_song-to-delete', mockMeta);
    store.set('song_file_song-to-delete', new Blob(['test']));

    const { result } = renderHook(() => useDownloads());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isDownloaded('song-to-delete')).toBe(true);

    await act(async () => {
      await result.current.removeDownload('song-to-delete');
    });

    expect(result.current.isDownloaded('song-to-delete')).toBe(false);
    expect(store.has('song_meta_song-to-delete')).toBe(false);
    expect(store.has('song_file_song-to-delete')).toBe(false);
  });

  it('should retrieve local lyrics and audio object URL', async () => {
    const mockBlob = new Blob(['sample audio data'], { type: 'audio/mpeg' });
    store.set('song_file_test-get-local', mockBlob);
    const mockLyrics = [{ time: 10, text: 'This is beautiful' }];
    store.set('song_lyric_test-get-local', mockLyrics);

    const url = await getLocalAudioUrl('test-get-local');
    expect(url).toBe('blob:mock-url');
    expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);

    const retrievedLyrics = await getLocalLyrics('test-get-local');
    expect(retrievedLyrics).toEqual(mockLyrics);
  });
});
