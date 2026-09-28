import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlayerProvider, usePlayer } from './PlayerProvider';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getMediaUrl: vi.fn(),
    getLyrics: vi.fn().mockResolvedValue([]),
    recordPlay: vi.fn().mockResolvedValue(undefined),
  },
  getProxiedCoverUrl: (url: string) => url,
}));

vi.mock('../hooks/useDownloads', () => ({
  getLocalAudioUrl: vi.fn().mockResolvedValue(null),
  getLocalLyrics: vi.fn().mockResolvedValue(null),
}));

function TestConsumer() {
  const { currentSong, isPlaying, playSong, audioRef } = usePlayer();
  return (
    <div>
      <div data-testid="current-song">{currentSong?.title ?? 'none'}</div>
      <div data-testid="is-playing">{isPlaying ? 'playing' : 'paused'}</div>
      <div data-testid="audio-src">{audioRef.current?.src ?? ''}</div>
      <button
        data-testid="play-1"
        onClick={() =>
          playSong({
            id: '1',
            title: 'Song 1',
            artist: 'Artist 1',
            album: 'Album 1',
            duration: 180,
            source: 'test',
            cover: '',
          })
        }
      >
        Play 1
      </button>
      <button
        data-testid="play-2"
        onClick={() =>
          playSong({
            id: '2',
            title: 'Song 2',
            artist: 'Artist 2',
            album: 'Album 2',
            duration: 200,
            source: 'test',
            cover: '',
          })
        }
      >
        Play 2
      </button>
    </div>
  );
}

describe('PlayerProvider race condition prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(function (this: HTMLMediaElement) {
      return Promise.resolve();
    });
    window.HTMLMediaElement.prototype.pause = vi.fn().mockImplementation(function (this: HTMLMediaElement) {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('plays the second song and ignores delayed first song response when switching rapidly', async () => {
    let resolveSong1: (url: string) => void;
    const song1Promise = new Promise<string>((resolve) => {
      resolveSong1 = resolve;
    });

    let resolveSong2: (url: string) => void;
    const song2Promise = new Promise<string>((resolve) => {
      resolveSong2 = resolve;
    });

    vi.mocked(api.getMediaUrl).mockImplementation((song) => {
      if (song.id === '1') return song1Promise;
      if (song.id === '2') return song2Promise;
      return Promise.resolve('https://example.com/other.mp3');
    });

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>
    );

    // Fast switch: user clicks song 1, then immediately clicks song 2
    fireEvent.click(screen.getByTestId('play-1'));
    fireEvent.click(screen.getByTestId('play-2'));

    expect(screen.getByTestId('current-song')).toHaveTextContent('Song 2');

    // Song 2 resolves first
    await act(async () => {
      resolveSong2!('https://example.com/song2.mp3');
      await song2Promise;
    });

    expect(screen.getByTestId('current-song')).toHaveTextContent('Song 2');
    expect(screen.getByTestId('audio-src')).toHaveTextContent('song2.mp3');

    // Now Song 1's slow network request finishes late
    await act(async () => {
      resolveSong1!('https://example.com/song1.mp3');
      await song1Promise;
    });

    // Song 2 should STILL be playing and NOT overwritten by Song 1
    expect(screen.getByTestId('current-song')).toHaveTextContent('Song 2');
    expect(screen.getByTestId('audio-src')).toHaveTextContent('song2.mp3');
    expect(screen.getByTestId('audio-src')).not.toHaveTextContent('song1.mp3');
  });

  it('uses global URL cache when playing the same song again, passing refresh=false initially', async () => {
    vi.mocked(api.getMediaUrl).mockResolvedValue('https://example.com/cached-song.mp3');

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>
    );

    // First play: should call getMediaUrl with refresh = false
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-1'));
    });

    expect(api.getMediaUrl).toHaveBeenCalledTimes(1);
    expect(api.getMediaUrl).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1' }),
      undefined,
      false
    );

    // Second play of same song: should hit cache and NOT call getMediaUrl again
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-1'));
    });

    expect(api.getMediaUrl).toHaveBeenCalledTimes(1); // Still 1!
  });

  it('auto-advances to next track when time reaches near end of song', async () => {
    vi.mocked(api.getMediaUrl).mockImplementation((song) => Promise.resolve(`https://example.com/${song.id}.mp3`));

    const songA = { id: 'a', title: 'Song A', artist: 'Artist A', duration: 100, source: 'test' };
    const songB = { id: 'b', title: 'Song B', artist: 'Artist B', duration: 100, source: 'test' };

    function PlaylistConsumer() {
      const { currentSong, playSong, audioRef, handleTimeUpdate } = usePlayer();
      return (
        <div>
          <div data-testid="song-title">{currentSong?.title ?? 'none'}</div>
          <button
            data-testid="start-playlist"
            onClick={() => playSong(songA, [songA, songB], 0)}
          >
            Start
          </button>
          <button
            data-testid="simulate-near-end"
            onClick={() => {
              if (audioRef.current) {
                Object.defineProperty(audioRef.current, 'currentTime', { value: 99.8, configurable: true, writable: true });
                Object.defineProperty(audioRef.current, 'duration', { value: 100, configurable: true, writable: true });
                handleTimeUpdate();
              }
            }}
          >
            Near End
          </button>
        </div>
      );
    }

    render(
      <PlayerProvider>
        <PlaylistConsumer />
      </PlayerProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('start-playlist'));
    });
    expect(screen.getByTestId('song-title')).toHaveTextContent('Song A');

    // Simulate reaching near the end (99.8s / 100s)
    await act(async () => {
      fireEvent.click(screen.getByTestId('simulate-near-end'));
    });

    // Should have auto-advanced to Song B
    expect(screen.getByTestId('song-title')).toHaveTextContent('Song B');
  });

  it('auto-advances to next track when browser auto-pauses near end without user action', async () => {
    vi.mocked(api.getMediaUrl).mockImplementation((song) => Promise.resolve(`https://example.com/${song.id}.mp3`));

    const songA = { id: 'a', title: 'Song A', artist: 'Artist A', duration: 200, source: 'test' };
    const songB = { id: 'b', title: 'Song B', artist: 'Artist B', duration: 200, source: 'test' };

    function PauseConsumer() {
      const { currentSong, playSong, audioRef } = usePlayer();
      return (
        <div>
          <div data-testid="song-title">{currentSong?.title ?? 'none'}</div>
          <button
            data-testid="start-playlist"
            onClick={() => playSong(songA, [songA, songB], 0)}
          >
            Start
          </button>
          <button
            data-testid="simulate-browser-pause"
            onClick={() => {
              if (audioRef.current) {
                // Simulate audio element reaching 195s out of 200s (5s remaining)
                Object.defineProperty(audioRef.current, 'currentTime', { value: 195, configurable: true, writable: true });
                Object.defineProperty(audioRef.current, 'duration', { value: 200, configurable: true, writable: true });
                // Trigger pause event from the element (not user togglePlay)
                fireEvent.pause(audioRef.current);
              }
            }}
          >
            Browser Pause
          </button>
        </div>
      );
    }

    render(
      <PlayerProvider>
        <PauseConsumer />
      </PlayerProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('start-playlist'));
    });
    expect(screen.getByTestId('song-title')).toHaveTextContent('Song A');

    // Simulate browser decoder running out of frames and firing pause at 195s / 200s
    await act(async () => {
      fireEvent.click(screen.getByTestId('simulate-browser-pause'));
    });

    // Should have auto-advanced to Song B
    expect(screen.getByTestId('song-title')).toHaveTextContent('Song B');
  });
});

