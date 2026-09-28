import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePlaylists } from '../hooks/usePlaylists';
import { useDownloads } from '../hooks/useDownloads';
import { useLibrary, type LibraryState } from '../hooks/useLibrary';
import { useToast, type ToastState } from '../hooks/useToast';
import { DEFAULT_QUALITY_KEY, qualityLabel } from '../constants/quality';
import { api } from '../services/api';
import { Song } from '../types';

export interface AppUser {
  username: string;
  nickname: string;
  avatar: string;
}

type PlaylistsState = ReturnType<typeof usePlaylists>;
type DownloadsState = ReturnType<typeof useDownloads>;

interface AppDataContextType {
  view: string;
  setView: (view: string) => void;
  user: AppUser | null;
  setUser: (user: AppUser | null) => void;
  library: LibraryState;
  playlists: PlaylistsState;
  downloads: DownloadsState;
  toast: ToastState | null;
  showToast: (toast: ToastState, duration?: number) => void;
  dismissToast: () => void;
  download: (song: Song, quality?: string) => Promise<void>;
  importFiles: (files: FileList | File[]) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState('search');
  const [user, setUser] = useState<AppUser | null>(null);

  const playlists = usePlaylists();
  const downloads = useDownloads();
  const { toast, show: showToast, dismiss: dismissToast } = useToast();
  const library = useLibrary({
    currentView: view,
    setView,
    playlists: playlists.playlists,
    downloads: downloads.downloads,
  });

  useEffect(() => {
    api.getMe().then((me) => {
      if (me) setUser(me as AppUser);
    });
  }, []);

  const download = useCallback(
    async (song: Song, quality?: string) => {
      const q = quality || localStorage.getItem(DEFAULT_QUALITY_KEY) || 'standard';
      try {
        const success = await downloads.downloadSong(song, q);
        if (success) {
          showToast(
            {
              message: `已保存《${song.title}》${qualityLabel(q)}，可在「本地下载」中查看`,
              actionText: '去查看',
              onAction: () => setView('downloads'),
            },
            6000
          );
        }
      } catch (err: unknown) {
        showToast({ message: `下载失败: ${(err as Error).message || String(err)}` }, 5000);
      }
    },
    [downloads, showToast]
  );

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      try {
        for (const file of list) {
          await downloads.importLocalFile(file);
        }
        showToast({ message: `成功导入 ${list.length} 首本地歌曲` }, 3000);
      } catch (err: unknown) {
        showToast({ message: `导入失败: ${(err as Error).message || String(err)}` }, 5000);
      }
    },
    [downloads, showToast]
  );

  const value: AppDataContextType = {
    view,
    setView,
    user,
    setUser,
    library,
    playlists,
    downloads,
    toast,
    showToast,
    dismissToast,
    download,
    importFiles,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextType {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}
