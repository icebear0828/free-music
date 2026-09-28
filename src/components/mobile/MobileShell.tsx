import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlertCircle, ChevronLeft, Heart, ListMusic, Music, Plus, Search, Settings, Upload } from 'lucide-react';
import { useAppData } from '../AppDataProvider';
import { usePlayer } from '../PlayerProvider';
import { MobileSongList } from './MobileSongList';
import { MobileTabBar } from './MobileTabBar';
import { MobileMiniPlayer } from './MobileMiniPlayer';
import { MobileNowPlaying } from './MobileNowPlaying';
import { SettingsView } from '../SettingsView';
import { ProfileView } from '../ProfileView';
import { Toast } from '../Toast';
import { PlayErrorToast } from '../PlayErrorToast';
import { getProxiedCoverUrl } from '../../services/api';
import { formatDate } from '../../utils/format';
import type { SearchType } from '../../hooks/useLibrary';
import { needsServerConfig } from '../../platform/runtime';

const SEARCH_TABS: { type: SearchType; label: string }[] = [
  { type: 'music', label: '单曲' },
  { type: 'artist', label: '歌手' },
  { type: 'album', label: '专辑' },
  { type: 'sheet', label: '歌单' },
];

interface RemoteItem {
  id?: string;
  title?: string;
  name?: string;
  artist?: string;
  coverImg?: string;
  avatar?: string;
  artwork?: string;
  pic?: string;
  worksNum?: number;
  date?: string | number;
  sourceId: string;
}

export function MobileShell() {
  const { view, setView, user, setUser, library, playlists, importFiles } = useAppData();
  const { currentSong, showLyricsView, setShowLyricsView } = usePlayer();
  const [draft, setDraft] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    searchType,
    searchResults,
    isSearching,
    errorString,
    search,
    loadRemoteList,
    sortedSongs,
    viewTitle,
    emptyStateText,
    currentPlaylist,
  } = library;

  // Navigating away collapses the full-screen player back to the mini bar.
  useEffect(() => {
    setShowLyricsView(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const isDrilledIn = view === 'remote_list' || view.startsWith('playlist_');
  const isSearchView = view === 'search';

  const goBack = () => setView(view === 'remote_list' ? 'search' : 'library');

  const renderBody = () => {
    if (view === 'profile') {
      return (
        <div className="px-4 pt-2">
          <ProfileView user={user} setUser={setUser} setView={setView} />
        </div>
      );
    }

    if (view === 'settings') {
      return (
        <div className="px-4 pt-2">
          <SettingsView />
        </div>
      );
    }

    if (view === 'library') {
      return (
        <div className="px-4 pt-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[22px] font-[700]">音乐库</h2>
            <button
              onClick={() => setNewPlaylistName('')}
              className="w-9 h-9 rounded-full bg-[#F5F5F7] flex items-center justify-center text-[#0071E3]"
              aria-label="新建歌单"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {newPlaylistName !== null && (
            <form
              className="flex gap-2 mb-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (newPlaylistName.trim()) playlists.createPlaylist(newPlaylistName.trim());
                setNewPlaylistName(null);
              }}
            >
              <input
                autoFocus
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="歌单名称"
                className="flex-1 min-w-0 h-11 px-3 rounded-[10px] border border-[#D5D5D7] text-[15px] focus:outline-none focus:border-[#0071E3]"
              />
              <button type="submit" className="px-4 h-11 rounded-[10px] bg-[#0071E3] text-white text-[14px] font-[600]">
                创建
              </button>
            </form>
          )}

          <ul className="divide-y divide-[#EDEDF2]">
            {playlists.playlists.map((playlist) => (
              <li key={playlist.id}>
                <button
                  className="w-full flex items-center gap-3 py-3 text-left active:opacity-60"
                  onClick={() => setView(`playlist_${playlist.id}`)}
                >
                  <span className="w-12 h-12 rounded-[10px] bg-[#F5F5F7] flex items-center justify-center text-[#0071E3] shrink-0">
                    {playlist.id === 'default' ? <Heart className="w-5 h-5 fill-current" /> : <ListMusic className="w-5 h-5" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-[600] truncate">{playlist.name}</span>
                    <span className="block text-[12px] text-[#6E6E73] mt-0.5">{playlist.items.length} 首</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (isSearching && searchResults.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-[#6E6E73]">
          <div className="w-7 h-7 border-[3px] border-[#0071E3]/20 border-t-[#0071E3] rounded-full animate-spin mb-3" />
          <p className="text-[15px]">加载中…</p>
        </div>
      );
    }

    if (errorString) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-[#e30000] px-8 text-center">
          <AlertCircle className="w-9 h-9 mb-3" />
          <p className="text-[15px]">{errorString}</p>
        </div>
      );
    }

    if (isSearchView && searchType !== 'music') {
      if (searchResults.length === 0) return renderEmpty();
      return (
        <div className="grid grid-cols-2 gap-4 px-4 pt-2">
          {(searchResults as RemoteItem[]).map((item, i) => (
            <button
              key={item.id || i}
              onClick={() => void loadRemoteList(searchType, item.sourceId, item)}
              className="flex flex-col gap-2 text-left active:opacity-60"
            >
              <img
                src={getProxiedCoverUrl(item.coverImg || item.avatar || item.artwork || item.pic)}
                referrerPolicy="no-referrer"
                alt={item.title || item.name}
                className={`w-full aspect-square object-cover bg-[#EDEDF2] ${
                  searchType === 'artist' ? 'rounded-full' : 'rounded-[12px]'
                }`}
              />
              <span className="text-[14px] font-[600] truncate">{item.title || item.name}</span>
              <span className="text-[11px] text-[#6E6E73] truncate -mt-1.5">
                {searchType === 'artist' && `${item.worksNum || 0} 张专辑`}
                {searchType === 'album' && `${item.artist || '未知'} · ${formatDate(item.date)}`}
                {searchType === 'sheet' && (item.artist || '歌单')}
              </span>
            </button>
          ))}
        </div>
      );
    }

    if (sortedSongs.length === 0) return renderEmpty();

    return (
      <div className="px-4 pt-1">
        {(isDrilledIn || view === 'downloads') && (
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[20px] font-[700] truncate">{currentPlaylist?.name ?? viewTitle}</h2>
            {view === 'downloads' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-[13px] text-[#0071E3] font-[600]"
              >
                <Upload className="w-4 h-4" />
                导入
              </button>
            )}
          </div>
        )}
        <MobileSongList songs={sortedSongs} />
      </div>
    );
  };

  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center py-24 text-[#6E6E73] px-8">
      <Music className="w-16 h-16 mb-4 opacity-25 stroke-[1.5px]" />
      <p className="text-[15px] text-center">{emptyStateText}</p>
      {needsServerConfig() && (
        <button
          onClick={() => setView('settings')}
          className="mt-5 px-5 h-11 rounded-full bg-[#0071E3] text-white text-[14px] font-[600]"
        >
          设置服务器地址
        </button>
      )}
      {view === 'downloads' && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-5 px-5 h-11 rounded-full bg-[#0071E3] text-white text-[14px] font-[600] flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          导入本地音乐
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-white text-[#1D1D1F] font-sans overflow-hidden">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files) void importFiles(e.target.files);
          e.target.value = '';
        }}
        multiple
        accept="audio/*"
        className="hidden"
      />

      <header
        className="shrink-0 bg-white/92 backdrop-blur-xl border-b border-[#EDEDF2] px-4 pb-2"
        style={{ paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-2">
          {isDrilledIn && (
            <button onClick={goBack} className="p-1 -ml-1 shrink-0" aria-label="返回">
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {isSearchView || isDrilledIn ? (
            <form
              className="flex-1 min-w-0 relative"
              onSubmit={(e) => {
                e.preventDefault();
                void search(draft, searchType);
              }}
            >
              <Search className="w-[18px] h-[18px] text-[#8E8E93] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="搜索歌曲、歌手、专辑"
                enterKeyHint="search"
                className="w-full h-10 pl-10 pr-3 rounded-[10px] bg-[#F5F5F7] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/25"
              />
            </form>
          ) : (
            <h1 className="flex-1 text-[20px] font-[700] truncate">{viewTitle}</h1>
          )}
          {(view === 'profile' || view === 'settings') && (
            <button
              onClick={() => setView(view === 'settings' ? 'profile' : 'settings')}
              className={`p-2 -mr-2 shrink-0 ${view === 'settings' ? 'text-[#0071E3]' : 'text-[#8E8E93]'}`}
              aria-label="设置"
            >
              <Settings className="w-[22px] h-[22px]" />
            </button>
          )}
        </div>

        {isSearchView && (
          <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
            {SEARCH_TABS.map((tab) => (
              <button
                key={tab.type}
                onClick={() => draft.trim() && void search(draft, tab.type)}
                className={`px-3.5 h-8 rounded-full text-[13px] shrink-0 transition-colors ${
                  searchType === tab.type
                    ? 'bg-[#0071E3] text-white font-[600]'
                    : 'bg-[#F5F5F7] text-[#333336] font-[500]'
                }`}
              >
                {tab.label}
              </button>
            ))}
            {isSearching && (
              <div className="w-4 h-4 border-[2px] border-[#0071E3]/30 border-t-[#0071E3] rounded-full animate-spin self-center ml-1" />
            )}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain pb-3">{renderBody()}</div>

      <PlayErrorToast />
      <Toast bottomOffset={currentSong ? 124 : 64} />

      <MobileMiniPlayer onExpand={() => setShowLyricsView(true)} />
      <MobileTabBar />

      <AnimatePresence>
        {showLyricsView && currentSong && <MobileNowPlaying onClose={() => setShowLyricsView(false)} />}
      </AnimatePresence>
    </div>
  );
}
