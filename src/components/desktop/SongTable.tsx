import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle, Download, Trash2 } from 'lucide-react';
import { Song } from '../../types';
import { usePlayer } from '../PlayerProvider';
import { useAppData } from '../AppDataProvider';
import { CoverImage } from '../CoverImage';
import { DownloadMenu } from '../DownloadMenu';
import { getProxiedCoverUrl } from '../../services/api';
import { formatDate, formatDuration } from '../../utils/format';
import type { SortField } from '../../hooks/useLibrary';
import type { DownloadedSong } from '../../hooks/useDownloads';

export function SongTable({ songs }: { songs: Song[] }) {
  const { playSong, currentSong } = usePlayer();
  const { view, library, downloads, download, playlists, setView } = useAppData();
  const { sortField, sortOrder, handleSort, currentPlaylist, setSearchQuery, search } = library;
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const isDownloadsView = view === 'downloads';

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-4 h-4 ml-1 inline" />
    ) : (
      <ArrowDown className="w-4 h-4 ml-1 inline" />
    );
  };

  const searchBy = (type: 'artist' | 'album', value: string) => {
    if (!value || value === 'Unknown') return;
    setSearchQuery(value);
    void search(value, type);
  };

  return (
    <>
      <div className="flex items-center gap-4 py-3 px-2 text-[12px] font-[600] text-[#6E6E73] border-b border-[#EDEDF2] uppercase tracking-wider mb-2">
        <div className="w-8 text-center">#</div>
        <div
          className="flex-1 min-w-0 cursor-pointer hover:text-[#1D1D1F] select-none"
          onClick={() => handleSort('title')}
        >
          <span>标题</span>
          <SortIcon field="title" />
        </div>
        <div
          className="w-1/4 truncate hidden sm:block cursor-pointer hover:text-[#1D1D1F] select-none"
          onClick={() => handleSort('artist')}
        >
          <span>歌手</span>
          <SortIcon field="artist" />
        </div>
        {isDownloadsView ? (
          <div
            className="w-1/4 truncate hidden sm:block cursor-pointer hover:text-[#1D1D1F] select-none"
            onClick={() => handleSort('downloadedAt')}
          >
            <span>下载时间</span>
            <SortIcon field="downloadedAt" />
          </div>
        ) : (
          <div className="w-1/4 truncate hidden sm:block">
            <span>专辑</span>
          </div>
        )}
        <div
          className="w-16 text-right cursor-pointer hover:text-[#1D1D1F] select-none mr-24"
          onClick={() => handleSort('duration')}
        >
          <span>时长</span>
          <SortIcon field="duration" />
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-[#EDEDF2] border-b border-[#EDEDF2]">
        {songs.map((song, i) => (
          <div
            key={song.id}
            className="flex items-center gap-4 py-[12px] px-2 hover:bg-[#F5F5F7] transition-colors group"
          >
            <div
              className="w-8 text-center text-[#6E6E73] text-[12px] cursor-pointer"
              onClick={() => playSong(song, songs)}
            >
              {currentSong?.id === song.id ? <span className="text-[#0071E3]">▶</span> : i + 1}
            </div>
            <div
              className="flex-1 min-w-0 flex items-center gap-4 cursor-pointer"
              onClick={() => playSong(song, songs)}
            >
              <CoverImage
                src={getProxiedCoverUrl(song.cover)}
                alt={song.title}
                className="w-11 h-11 rounded-[6px] flex-shrink-0 bg-[#EDEDF2] border border-black/5 shadow-sm"
              />
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p
                  className={`font-[600] truncate text-[17px] leading-[25px] ${
                    currentSong?.id === song.id ? 'text-[#0071E3]' : 'text-[#1D1D1F]'
                  }`}
                >
                  {song.title}
                </p>
                <p className="text-[12px] leading-[16px] text-[#6E6E73] sm:hidden truncate">
                  {song.artist} - {song.album}
                </p>
              </div>
            </div>

            <div
              className="w-1/4 text-[17px] leading-[25px] text-[#333336] truncate hidden sm:block cursor-pointer font-[400] hover:text-[#0071E3] hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                searchBy('artist', song.artist);
              }}
            >
              {song.artist}
            </div>

            {isDownloadsView ? (
              <div
                className="w-1/4 text-[17px] leading-[25px] text-[#333336] truncate hidden sm:block cursor-pointer font-[400]"
                onClick={() => playSong(song, songs)}
              >
                {formatDate((song as DownloadedSong).downloadedAt)}
              </div>
            ) : (
              <div
                className="w-1/4 text-[17px] leading-[25px] text-[#333336] truncate hidden sm:block cursor-pointer font-[400] hover:text-[#0071E3] hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  searchBy('album', song.album);
                }}
              >
                {song.album}
              </div>
            )}

            <div
              className="w-16 text-right text-[13px] leading-[20px] text-[#6E6E73] font-mono cursor-pointer"
              onClick={() => playSong(song, songs)}
            >
              {formatDuration(song.duration)}
            </div>

            <div className="w-24 flex items-center justify-end gap-3 text-[#6E6E73] shrink-0 relative">
              {currentPlaylist && currentPlaylist.id !== 'default' && (
                <button
                  className="hover:text-[#e30000] p-2 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    playlists.removeFromPlaylist(currentPlaylist.id, song.id);
                  }}
                  title="从歌单移出"
                >
                  <Trash2 className="w-[18px] h-[18px]" />
                </button>
              )}
              {isDownloadsView && (
                <button
                  className="hover:text-[#e30000] p-2 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    void downloads.removeDownload(song.id);
                    setView('downloads');
                  }}
                  title="删除本地下载"
                >
                  <Trash2 className="w-[18px] h-[18px]" />
                </button>
              )}

              {downloads.isDownloading(song.id) ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#0071E3] font-mono w-8 text-right">
                    {downloads.downloadProgress[song.id] ?? 0}%
                  </span>
                  <div className="w-4 h-4 border-[2px] border-[#0071E3]/30 border-t-[#0071E3] rounded-full animate-spin" />
                </div>
              ) : (
                <button
                  className={`transition-all p-2 hover:scale-105 ${
                    downloads.isDownloaded(song.id) ? 'text-[#0071E3]' : 'hover:text-[#0071E3]'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === song.id ? null : song.id);
                  }}
                  title={downloads.isDownloaded(song.id) ? '已下载，点击重新选择音质' : '选择品质并下载'}
                >
                  {downloads.isDownloaded(song.id) ? (
                    <CheckCircle className="w-[20px] h-[20px]" />
                  ) : (
                    <Download className="w-[20px] h-[20px]" />
                  )}
                </button>
              )}

              {openMenuId === song.id && (
                <DownloadMenu
                  className="absolute right-0 top-full mt-1 z-40"
                  onSelect={(quality) => {
                    void download(song, quality);
                    setOpenMenuId(null);
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
