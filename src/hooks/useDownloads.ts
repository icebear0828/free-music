import { useState, useEffect } from 'react';
import localforage from 'localforage';
import { Song, LyricLine } from '../types';
import { api } from '../services/api';
import { apiUrl } from '../platform/runtime';

export interface DownloadedSong extends Song {
  downloadedAt: number;
}

const db = localforage.createInstance({
  name: 'music_player',
  storeName: 'downloads'
});

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadedSong[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    loadDownloads();
  }, []);

  const loadDownloads = async () => {
    try {
      const keys = await db.keys();
      const songs: DownloadedSong[] = [];
      for (const key of keys) {
        if (key.startsWith('song_meta_')) {
          const meta = await db.getItem<DownloadedSong>(key);
          if (meta) songs.push(meta);
        }
      }
      setDownloads(songs.sort((a, b) => b.downloadedAt - a.downloadedAt));
    } catch (err) {
      console.error('Failed to load downloads', err);
    }
  };

  const downloadSong = async (song: Song, quality?: string) => {
    if (downloadingIds.has(song.id)) return false;
    
    setDownloadingIds(prev => {
      const next = new Set(prev);
      next.add(song.id);
      return next;
    });

    try {
      // Try to get URL from primary source, fallback to alternative sources if it fails
      let url = '';
      let activeSong = { ...song };
      try {
        url = await api.getMediaUrl(song, quality);
      } catch (err) {
        if (song.alternativeSources && song.alternativeSources.length > 0) {
          let success = false;
          for (const alt of song.alternativeSources) {
            try {
              const altSong = { ...song, sourceId: alt.sourceId, raw: alt.raw };
              url = await api.getMediaUrl(altSong, quality);
              activeSong = altSong;
              success = true;
              break;
            } catch (e) {}
          }
          if (!success) throw err;
        } else {
          throw err;
        }
      }
      if (!url) throw new Error('No URL found');

      // Fetch lyrics matching the successful active source
      const lyrics = await api.getLyrics(activeSong).catch(() => []);

      // Use our backend proxy to avoid CORS issues, but check if it's already a proxy or relative URL
      let proxyUrl = url;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        proxyUrl = apiUrl(`/api/proxy?url=${encodeURIComponent(url)}`);
      }
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('Failed to fetch audio data from proxy');
      
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      
      let loaded = 0;
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.length;
          if (total) {
            setDownloadProgress(prev => ({
              ...prev,
              [song.id]: Math.round((loaded / total) * 100)
            }));
          }
        }
      }
      
      const contentType = response.headers.get('content-type') || '';
      let extension = 'mp3';
      const q = quality || localStorage.getItem('music_audio_quality') || 'standard';
      
      if (contentType.includes('flac')) {
        extension = 'flac';
      } else if (contentType.includes('wav')) {
        extension = 'wav';
      } else if (contentType.includes('m4a') || contentType.includes('x-m4a') || contentType.includes('mp4')) {
        extension = 'm4a';
      } else if (q === 'flac') {
        extension = 'flac';
      } else if (q === 'wav') {
        extension = 'wav';
      }
      
      const blob = new Blob(chunks, { type: contentType || 'audio/mpeg' });
      
      // Trigger actual browser download to user's file system
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const safeTitle = (song.title || 'Unknown').replace(/[<>:"/\\|?*]/g, '');
      const safeArtist = (song.artist || 'Unknown').replace(/[<>:"/\\|?*]/g, '');
      a.download = `${safeArtist} - ${safeTitle}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      const downloadedSong: DownloadedSong = { ...song, downloadedAt: Date.now() };
      
      await db.setItem(`song_file_${song.id}`, blob);
      await db.setItem(`song_meta_${song.id}`, downloadedSong);
      await db.setItem(`song_lyric_${song.id}`, lyrics);
      
      await loadDownloads();
      return true;
    } catch (e: unknown) {
      console.error('Download failed:', e);
      throw e;
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(song.id);
        return next;
      });
      setDownloadProgress(prev => {
        const next = { ...prev };
        delete next[song.id];
        return next;
      });
    }
  };

  const removeDownload = async (id: string) => {
    try {
      await db.removeItem(`song_file_${id}`);
      await db.removeItem(`song_meta_${id}`);
      await db.removeItem(`song_lyric_${id}`);
      await loadDownloads();
    } catch (e) {
      console.error('Failed to remove download', e);
    }
  };

  const isDownloaded = (id: string) => downloads.some(d => d.id === id);
  const isDownloading = (id: string) => downloadingIds.has(id);

  const importLocalFile = async (file: File) => {
    try {
      const id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fileName = file.name.replace(/\.[^/.]+$/, "");
      let fileType = file.type;
      
      // Some file systems/browsers drop type or leave it empty, fallback based on extension
      if (!fileType || fileType === 'application/octet-stream') {
         if (file.name.toLowerCase().endsWith('.flac')) fileType = 'audio/flac';
         else if (file.name.toLowerCase().endsWith('.wav')) fileType = 'audio/wav';
         else if (file.name.toLowerCase().endsWith('.m4a')) fileType = 'audio/mp4';
         else fileType = 'audio/mpeg';
      }
      
      const fileToSave = new File([file], file.name, { type: fileType });
      
      let title = fileName;
      let artist = 'Unknown';
      
      if (fileName.includes('-')) {
        const parts = fileName.split('-');
        artist = parts[0].trim();
        title = parts.slice(1).join('-').trim();
      }

      const duration = await new Promise<number>((resolve) => {
        const objectUrl = URL.createObjectURL(fileToSave);
        const audio = new Audio();
        audio.addEventListener('loadedmetadata', () => {
          resolve(audio.duration * 1000);
          URL.revokeObjectURL(objectUrl);
        });
        audio.addEventListener('error', () => {
          resolve(0);
          URL.revokeObjectURL(objectUrl);
        });
        audio.src = objectUrl;
      });

      const importedSong: DownloadedSong = {
        id,
        title,
        artist,
        album: '本地导入',
        cover: '',
        duration,
        source: 'local',
        downloadedAt: Date.now()
      };

      await db.setItem(`song_file_${id}`, fileToSave);
      await db.setItem(`song_meta_${id}`, importedSong);
      await loadDownloads();
      
      return importedSong;
    } catch (e) {
      console.error('Import failed', e);
      throw e;
    }
  };

  return { downloads, downloadSong, removeDownload, isDownloaded, isDownloading, downloadProgress, importLocalFile };
}

export const getLocalAudioUrl = async (id: string): Promise<string | null> => {
  try {
    let blob = await db.getItem<Blob>(`song_file_${id}`);
    if (blob) {
      if (!blob.type || blob.type === 'application/octet-stream') {
        const ext = id.split('.').pop()?.toLowerCase();
        let mime = 'audio/mpeg';
        if (ext === 'flac') mime = 'audio/flac';
        else if (ext === 'wav') mime = 'audio/wav';
        else if (ext === 'm4a') mime = 'audio/mp4';
        
        blob = new Blob([blob], { type: mime });
      }
      return URL.createObjectURL(blob);
    }
    return null;
  } catch (e) {
    console.error('Failed to get local audio url', e);
    return null;
  }
};

export const getLocalLyrics = async (id: string): Promise<LyricLine[] | null> => {
  try {
    return await db.getItem<LyricLine[]>(`song_lyric_${id}`);
  } catch (e) {
    console.error('Failed to get local lyrics', e);
    return null;
  }
};
