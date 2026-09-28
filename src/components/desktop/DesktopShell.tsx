import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Music, Plus } from 'lucide-react';
import { Sidebar } from '../Sidebar';
import { SearchBar } from '../SearchBar';
import { PlayerBar } from '../PlayerBar';
import { LyricsView } from '../LyricsView';
import { ProfileView } from '../ProfileView';
import { SettingsView } from '../SettingsView';
import { SongTable } from './SongTable';
import { Toast } from '../Toast';
import { PlayErrorToast } from '../PlayErrorToast';
import { useAppData } from '../AppDataProvider';
import { usePlayer } from '../PlayerProvider';
import { getProxiedCoverUrl } from '../../services/api';
import { formatDate } from '../../utils/format';
import type { SearchType } from '../../hooks/useLibrary';

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

export function DesktopShell() {
  const { view, setView, user, setUser, library, playlists, importFiles } = useAppData();
  const { showLyricsView, setShowLyricsView } = usePlayer();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShowLyricsView(false);
  }, [view, setShowLyricsView]);

  const {
    searchQuery,
    setSearchQuery,
    searchType,
    searchResults,
    isSearching,
    errorString,
    selectedSources,
    toggleSource,
    search,
    loadRemoteList,
    sortedSongs,
    viewTitle,
    emptyStateText,
  } = library;

  const hasContent = sortedSongs.length > 0 || (view === 'search' && searchResults.length > 0);

  return (
    <div className="flex h-screen bg-white text-[#1D1D1F] font-sans overflow-hidden">
      <Sidebar
        currentView={view}
        setView={setView}
        playlists={playlists.playlists}
        createPlaylist={playlists.createPlaylist}
        removePlaylist={playlists.removePlaylist}
        user={user}
      />

      <main className="flex-1 flex flex-col min-w-0 relative h-full pb-20">
        <AnimatePresence>{showLyricsView && <LyricsView />}</AnimatePresence>

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

        <PlayErrorToast />

        <div className="flex px-8 py-[18px] border-b border-[#EDEDF2] items-center justify-between z-10 shrink-0 bg-white/90 backdrop-blur-md sticky top-0">
          <SearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onSearch={(_e, query) => void search(query ?? searchQuery)}
            selectedSources={selectedSources}
            onToggleSource={toggleSource}
          />
          {view === 'search' && (
            <div className="flex gap-2">
              {SEARCH_TABS.map((tab) => (
                <button
                  key={tab.type}
                  onClick={() => searchQuery && void search(searchQuery, tab.type)}
                  className={`px-4 h-[44px] text-[17px] rounded-full transition-colors flex items-center justify-center ${
                    searchType === tab.type
                      ? 'bg-[#0071E3] text-white font-[600]'
                      : 'hover:bg-[#0071E3]/5 text-[#333336] hover:text-[#0071E3] font-[400]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1.0] }}
              className="w-full min-h-full flex flex-col justify-start"
            >
              {view === 'profile' ? (
                <ProfileView user={user} setUser={setUser} setView={setView} />
              ) : view === 'settings' ? (
                <SettingsView />
              ) : isSearching && searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-[#6E6E73]">
                  <div className="w-8 h-8 border-[3px] border-[#0071E3]/20 border-t-[#0071E3] rounded-full animate-spin mb-4" />
                  <p className="text-[17px]">加载中...</p>
                </div>
              ) : errorString ? (
                <div className="flex flex-col items-center justify-center h-64 text-[#e30000]">
                  <AlertCircle className="w-10 h-10 mb-4" />
                  <p className="text-[17px]">{errorString}</p>
                </div>
              ) : hasContent ? (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-[28px] leading-[32px] font-[600]">{viewTitle}</h2>
                    {isSearching && (
                      <div className="w-5 h-5 border-[2px] border-[#0071E3]/30 border-t-[#0071E3] rounded-full animate-spin mt-1" />
                    )}
                    <div className="flex-1" />
                    {view === 'downloads' && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-[#0071E3] text-white rounded-full text-[14px] font-medium hover:bg-[#0051A3] transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        导入本地音乐
                      </button>
                    )}
                  </div>

                  {view === 'search' && searchType !== 'music' ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {(searchResults as RemoteItem[]).map((item, i) => (
                        <div
                          key={item.id || i}
                          onClick={() => void loadRemoteList(searchType, item.sourceId, item)}
                          className="flex flex-col gap-3 group cursor-pointer hover:bg-[#F5F5F7] p-6 rounded-[16px] border border-transparent hover:border-[#EDEDF2] transition-colors"
                        >
                          <div className="w-full aspect-square relative rounded-[12px] overflow-hidden bg-[#EDEDF2]">
                            <img
                              src={getProxiedCoverUrl(item.coverImg || item.avatar || item.artwork || item.pic)}
                              referrerPolicy="no-referrer"
                              alt={item.title || item.name}
                              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                                searchType === 'artist' ? 'rounded-full scale-90 group-hover:scale-100 shadow-sm' : ''
                              }`}
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[17px] leading-[25px] font-[600] truncate">
                              {item.title || item.name}
                            </span>
                            <span className="text-[12px] leading-[16px] text-[#6E6E73] truncate mt-1">
                              {searchType === 'artist' && `歌手 • ${item.worksNum || 0} 张专辑`}
                              {searchType === 'album' && `${item.artist || '未知'} • ${formatDate(item.date)}`}
                              {searchType === 'sheet' && `歌单 • ${item.artist || '未知'}`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <SongTable songs={sortedSongs} />
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-[#6E6E73] mt-20">
                  <Music className="w-20 h-20 mb-6 opacity-30 stroke-[1.5px]" />
                  <p className="text-center font-[400] text-[17px]">{emptyStateText}</p>
                  {view === 'downloads' && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-6 px-6 py-2.5 bg-[#0071E3] text-white rounded-full text-[15px] font-medium hover:bg-[#0051A3] transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-[18px] h-[18px]" />
                      导入本地音乐
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <Toast />
      </main>

      <PlayerBar
        playlists={playlists.playlists}
        toggleInPlaylist={playlists.toggleInPlaylist}
        isInPlaylist={playlists.isInPlaylist}
      />
    </div>
  );
}
