import { useState } from 'react';
import { CheckCircle, Download, MoreHorizontal, Trash2, X } from 'lucide-react';
import { Song } from '../../types';
import { usePlayer } from '../PlayerProvider';
import { useAppData } from '../AppDataProvider';
import { CoverImage } from '../CoverImage';
import { getProxiedCoverUrl } from '../../services/api';
import { formatDuration } from '../../utils/format';
import { QUALITY_OPTIONS } from '../../constants/quality';

export function MobileSongList({ songs }: { songs: Song[] }) {
  const { playSong, currentSong, isPlaying } = usePlayer();
  const { downloads, download, playlists, library, view } = useAppData();
  const [sheetSong, setSheetSong] = useState<Song | null>(null);

  const currentPlaylist = library.currentPlaylist;

  return (
    <>
      <ul className="divide-y divide-[#EDEDF2]">
        {songs.map((song) => {
          const active = currentSong?.id === song.id;
          return (
            <li key={song.id} className="flex items-center gap-3 py-2.5 pr-1">
              <button
                className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-60 transition-opacity"
                onClick={() => void playSong(song, songs)}
              >
                <CoverImage
                  src={getProxiedCoverUrl(song.cover)}
                  alt={song.title}
                  className="w-12 h-12 rounded-[8px] shrink-0 bg-[#EDEDF2] border border-black/5"
                />
                <span className="flex-1 min-w-0 flex flex-col">
                  <span
                    className={`text-[15px] leading-[20px] font-[600] truncate ${
                      active ? 'text-[#0071E3]' : 'text-[#1D1D1F]'
                    }`}
                  >
                    {active && isPlaying ? '♪ ' : ''}
                    {song.title}
                  </span>
                  <span className="text-[12px] leading-[16px] text-[#6E6E73] truncate mt-0.5">
                    {song.artist}
                    {song.album && song.album !== 'Unknown' ? ` · ${song.album}` : ''}
                  </span>
                </span>
                <span className="text-[11px] text-[#8E8E93] font-mono shrink-0">
                  {formatDuration(song.duration)}
                </span>
              </button>
              <button
                className="w-10 h-10 flex items-center justify-center text-[#8E8E93] shrink-0"
                onClick={() => setSheetSong(song)}
                aria-label="更多操作"
              >
                {downloads.isDownloading(song.id) ? (
                  <span className="text-[11px] font-mono text-[#0071E3]">
                    {downloads.downloadProgress[song.id] ?? 0}%
                  </span>
                ) : downloads.isDownloaded(song.id) ? (
                  <CheckCircle className="w-5 h-5 text-[#0071E3]" />
                ) : (
                  <MoreHorizontal className="w-5 h-5" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {sheetSong && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 flex items-end"
          onClick={() => setSheetSong(null)}
        >
          <div
            className="w-full bg-white rounded-t-[20px] p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] animate-[slideUpSheet_.22s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3 mb-2 border-b border-[#EDEDF2]">
              <CoverImage
                src={getProxiedCoverUrl(sheetSong.cover)}
                alt={sheetSong.title}
                className="w-11 h-11 rounded-[8px] bg-[#EDEDF2]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-[600] truncate">{sheetSong.title}</p>
                <p className="text-[12px] text-[#6E6E73] truncate">{sheetSong.artist}</p>
              </div>
              <button onClick={() => setSheetSong(null)} className="p-2 text-[#8E8E93]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] font-[600] text-[#8E8E93] uppercase tracking-wider px-1 py-2">
              下载音质
            </p>
            {QUALITY_OPTIONS.map((option) => (
              <button
                key={option.id}
                className="w-full flex items-center justify-between px-1 h-12 text-[15px] active:bg-[#F5F5F7] rounded-[10px]"
                onClick={() => {
                  void download(sheetSong, option.id);
                  setSheetSong(null);
                }}
              >
                <span className="flex items-center gap-2.5">
                  <Download className="w-[18px] h-[18px] text-[#0071E3]" />
                  {option.label}
                </span>
                <span className="text-[10px] text-[#8E8E93] font-[600]">{option.badge}</span>
              </button>
            ))}

            <button
              className="w-full flex items-center gap-2.5 px-1 h-12 text-[15px] active:bg-[#F5F5F7] rounded-[10px] mt-1"
              onClick={() => {
                playlists.toggleInPlaylist('default', sheetSong);
                setSheetSong(null);
              }}
            >
              <span className="text-[18px] leading-none">♥</span>
              {playlists.isInPlaylist('default', sheetSong.id) ? '取消喜欢' : '添加到我喜欢的音乐'}
            </button>

            {currentPlaylist && currentPlaylist.id !== 'default' && (
              <button
                className="w-full flex items-center gap-2.5 px-1 h-12 text-[15px] text-[#e30000] active:bg-[#F5F5F7] rounded-[10px]"
                onClick={() => {
                  playlists.removeFromPlaylist(currentPlaylist.id, sheetSong.id);
                  setSheetSong(null);
                }}
              >
                <Trash2 className="w-[18px] h-[18px]" />
                从歌单移出
              </button>
            )}

            {view === 'downloads' && (
              <button
                className="w-full flex items-center gap-2.5 px-1 h-12 text-[15px] text-[#e30000] active:bg-[#F5F5F7] rounded-[10px]"
                onClick={() => {
                  void downloads.removeDownload(sheetSong.id);
                  setSheetSong(null);
                }}
              >
                <Trash2 className="w-[18px] h-[18px]" />
                删除本地文件
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
