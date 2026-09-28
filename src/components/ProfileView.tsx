import React, { useState, useEffect } from 'react';
import { User, Lock, Edit3, LogOut, Disc, Play, Star, Sparkles, RefreshCw, BarChart2, ShieldAlert } from 'lucide-react';
import { api, getProxiedCoverUrl } from '../services/api';
import { usePlayer } from './PlayerProvider';
import { CoverImage } from './CoverImage';
import { AuthUser, PlayStat, Song } from '../types';

export function ProfileView({ user, setUser, setView }: { user: AuthUser | null; setUser: (u: AuthUser | null) => void; setView: (v: string) => void }) {
  const { playSong } = usePlayer();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(() => Math.random().toString(36).substring(7));
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Edit profile states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  // Stats states
  const [personalStats, setPersonalStats] = useState<PlayStat[]>([]);
  const [globalStats, setGlobalStats] = useState<PlayStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const currentAvatarUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${avatarSeed}`;

  // Fetch stats when logged in
  useEffect(() => {
    if (user) {
      loadStats();
      setEditNickname(user.nickname);
      setEditAvatar(user.avatar);
    }
  }, [user]);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const [personal, global] = await Promise.all([
        api.getTopStats(15),
        api.getGlobalStats(15)
      ]);
      setPersonalStats(personal);
      setGlobalStats(global);
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('请输入用户名和密码');
      return;
    }

    setErrorMsg('');
    setLoading(true);

    try {
      if (isLogin) {
        const data = await api.login(username, password);
        setUser(data.user);
      } else {
        const avatarUrl = currentAvatarUrl;
        const data = await api.register(username, password, nickname || username, avatarUrl);
        setUser(data.user);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || '认证失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setUsername('');
    setPassword('');
    setNickname('');
    setPersonalStats([]);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNickname.trim()) return;

    setLoading(true);
    try {
      const updatedUser = await api.updateProfile(editNickname, editAvatar);
      setUser(updatedUser);
      setIsEditingProfile(false);
    } catch (err: unknown) {
      alert((err as Error).message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  const playStatSong = (statItem: PlayStat) => {
    // Map stat items to standard Song type
    const song: Song = {
      id: statItem.songId,
      sourceId: statItem.sourceId,
      title: statItem.title,
      artist: statItem.artist,
      album: statItem.album || '',
      cover: statItem.cover || '',
      duration: 0,
      source: statItem.sourceId,
      raw: statItem.raw || {
        id: statItem.songId,
        songId: statItem.songId,
        mid: statItem.songId,
        songmid: statItem.songId,
        hash: statItem.songId,
        title: statItem.title,
        artist: statItem.artist,
        album: statItem.album
      }
    };
    playSong(song);
  };

  const randomizeAvatar = () => {
    const seed = Math.random().toString(36).substring(7);
    setAvatarSeed(seed);
  };

  const randomizeEditAvatar = () => {
    const seed = Math.random().toString(36).substring(7);
    setEditAvatar(`https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`);
  };

  const totalPlays = personalStats.reduce((sum, item) => sum + item.playCount, 0);

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[460px] bg-white border border-[#EDEDF2] rounded-[24px] shadow-[0_12px_40px_rgba(0,0,0,0.06)] overflow-hidden p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#0071E3]/10 text-[#0071E3] mb-4">
              <User className="w-8 h-8 fill-current" />
            </div>
            <h2 className="text-[24px] font-[600] text-[#1D1D1F] tracking-tight">
              {isLogin ? '登录您的账号' : '注册新账号'}
            </h2>
            <p className="text-[14px] text-[#6E6E73] mt-2">
              {isLogin ? '登录后即可保存您的播放习惯和个人化统计数据' : '创建一个新账号，开启您的音乐记录之旅'}
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 bg-[#FF3B30]/10 border border-[#FF3B30]/20 text-[#FF3B30] rounded-[12px] flex items-center gap-3 text-[14px]">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-5">
            <div>
              <label className="block text-[13px] font-[600] text-[#6E6E73] uppercase tracking-wider mb-2">用户名</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)}
                  placeholder="请输入您的用户名"
                  required
                  className="w-full bg-[#F5F5F7] border border-transparent rounded-[12px] pl-10 pr-4 py-3 text-[16px] text-[#1D1D1F] focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-[3px] focus:ring-[#0071E3]/10 transition-all h-[48px]"
                />
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93]" />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-[600] text-[#6E6E73] uppercase tracking-wider mb-2">密码</label>
              <div className="relative">
                <input 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  placeholder="请输入您的密码"
                  required
                  className="w-full bg-[#F5F5F7] border border-transparent rounded-[12px] pl-10 pr-4 py-3 text-[16px] text-[#1D1D1F] focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-[3px] focus:ring-[#0071E3]/10 transition-all h-[48px]"
                />
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93]" />
              </div>
            </div>

            {!isLogin && (
              <>
                <div>
                  <label className="block text-[13px] font-[600] text-[#6E6E73] uppercase tracking-wider mb-2">个性昵称</label>
                  <input 
                    type="text" 
                    value={nickname} 
                    onChange={e => setNickname(e.target.value)}
                    placeholder="选填，默认同用户名"
                    className="w-full bg-[#F5F5F7] border border-transparent rounded-[12px] px-4 py-3 text-[16px] text-[#1D1D1F] focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-[3px] focus:ring-[#0071E3]/10 transition-all h-[48px]"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-[600] text-[#6E6E73] uppercase tracking-wider mb-2">定制头像</label>
                  <div className="flex items-center gap-4 p-3 bg-[#F5F5F7] rounded-[16px] border border-transparent">
                    <img src={currentAvatarUrl} alt="Avatar Preview" className="w-14 h-14 rounded-full border border-black/5 bg-white object-cover" />
                    <div className="flex-1">
                      <span className="text-[12px] font-semibold text-[#1D1D1F]">智能生成头像</span>
                      <p className="text-[11px] text-[#6E6E73] mt-0.5">点击随机按钮生成您喜爱的头像风格</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={randomizeAvatar}
                      className="p-2.5 rounded-full hover:bg-black/5 text-[#0071E3] transition-colors"
                      title="随机生成"
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 h-[48px] bg-[#0071E3] hover:bg-[#0051A3] active:scale-[0.98] text-white rounded-[12px] text-[16px] font-[600] transition-all shadow-sm disabled:opacity-50 mt-6"
            >
              {loading && <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
              {isLogin ? '登录' : '立即注册'}
            </button>
          </form>

          <div className="text-center mt-6 pt-6 border-t border-[#EDEDF2]">
            <button 
              onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }}
              className="text-[#0071E3] hover:text-[#0051A3] text-[14px] font-[600] hover:underline"
            >
              {isLogin ? '没有账号？立即注册' : '已有账号？立即登录'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto py-4 px-2 sm:px-6">
      {/* Profile Card */}
      <div className="bg-white border border-[#EDEDF2] rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-6 mb-8 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#0071E3]/5 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>
        <img 
          src={user.avatar} 
          alt="Avatar" 
          className="w-24 h-24 rounded-full border-[3px] border-[#0071E3]/10 bg-[#F5F5F7] object-cover relative z-10 shadow-sm shrink-0" 
        />
        <div className="flex-1 text-center md:text-left relative z-10 overflow-hidden">
          {isEditingProfile ? (
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <input 
                  type="text" 
                  value={editNickname}
                  onChange={e => setEditNickname(e.target.value)}
                  placeholder="输入新昵称"
                  required
                  className="bg-[#F5F5F7] border border-transparent rounded-[10px] px-3 py-1.5 text-[16px] font-semibold text-[#1D1D1F] focus:outline-none focus:bg-white focus:border-[#0071E3]"
                />
                <div className="flex items-center gap-2">
                  <button 
                    type="button" 
                    onClick={randomizeEditAvatar}
                    className="px-3 py-1.5 bg-[#F5F5F7] text-[#0071E3] hover:bg-[#0071E3]/10 rounded-[10px] text-[13px] font-[600] transition-colors flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-current" /> 随机头像
                  </button>
                  <button 
                    type="submit" 
                    className="px-4 py-1.5 bg-[#0071E3] text-white rounded-[10px] text-[13px] font-[600] hover:bg-[#0051A3] transition-colors"
                  >
                    保存
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { setIsEditingProfile(false); setEditNickname(user.nickname); setEditAvatar(user.avatar); }}
                    className="px-4 py-1.5 border border-[#EDEDF2] text-[#6E6E73] hover:bg-[#F5F5F7] rounded-[10px] text-[13px] font-[600] transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center justify-center md:justify-start gap-3">
                <h2 className="text-[26px] font-[600] text-[#1D1D1F] tracking-tight truncate">{user.nickname}</h2>
                <button 
                  onClick={() => setIsEditingProfile(true)}
                  className="p-1.5 rounded-full hover:bg-black/5 text-[#8E8E93] hover:text-[#0071E3] transition-colors"
                  title="编辑资料"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[13px] text-[#6E6E73] mt-1 font-mono">账号: {user.username}</p>
            </>
          )}

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 mt-4 pt-4 border-t border-[#EDEDF2] text-[14px]">
            <div className="flex items-center gap-2">
              <Disc className="w-4 h-4 text-[#0071E3]" />
              <span className="text-[#6E6E73]">累计播放</span>
              <span className="font-[600] text-[#1D1D1F]">{totalPlays || 0} 次</span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-[#FF9500]" />
              <span className="text-[#6E6E73]">最爱曲目</span>
              <span className="font-[600] text-[#1D1D1F]">{personalStats[0]?.title || '无'}</span>
            </div>
          </div>
        </div>

        <button 
          onClick={handleLogout}
          className="md:absolute md:top-6 md:right-6 flex items-center gap-2 px-4 py-2 text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-[12px] text-[14px] font-[600] transition-colors border border-transparent hover:border-[#FF3B30]/20"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>
      </div>

      {/* Stats Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Personal Statistics */}
        <div className="bg-white border border-[#EDEDF2] rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-6">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#EDEDF2]">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-[#0071E3]" />
              <h3 className="text-[18px] font-[600] text-[#1D1D1F] tracking-tight">个人最常播放</h3>
            </div>
            <button onClick={loadStats} className="text-[#6E6E73] hover:text-[#0071E3] transition-colors">
              <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {statsLoading && personalStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#6E6E73]">
              <div className="w-6 h-6 border-2 border-[#0071E3]/20 border-t-[#0071E3] rounded-full animate-spin mb-3"></div>
              <span className="text-[14px]">载入统计中...</span>
            </div>
          ) : personalStats.length === 0 ? (
            <div className="text-center py-16 text-[#8E8E93] text-[14px]">
              <Disc className="w-10 h-10 mx-auto mb-3 opacity-30" />
              暂无播放统计，多听些歌吧！
            </div>
          ) : (
            <div className="space-y-1">
              {personalStats.map((item, index) => (
                <div 
                  key={item.songId}
                  className="flex items-center gap-3 p-2.5 rounded-[12px] hover:bg-[#F5F5F7] group transition-colors cursor-pointer"
                  onClick={() => playStatSong(item)}
                >
                  <div className="w-6 text-[14px] font-bold text-[#8E8E93] text-center font-mono">
                    {index + 1}
                  </div>
                  <div className="relative w-10 h-10 rounded-[6px] bg-[#EDEDF2] overflow-hidden shadow-sm shrink-0">
                    <CoverImage src={getProxiedCoverUrl(item.cover)} alt="Cover" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-[14px] font-[600] text-[#1D1D1F] leading-tight truncate group-hover:text-[#0071E3] transition-colors">{item.title}</p>
                    <p className="text-[12px] text-[#6E6E73] truncate mt-0.5">{item.artist}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[13px] font-[600] text-[#1D1D1F] block">{item.playCount} 次</span>
                    <span className="text-[10px] text-[#8E8E93] font-mono block mt-0.5">播放</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Statistics */}
        <div className="bg-white border border-[#EDEDF2] rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-6">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#EDEDF2]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#FF9500]" />
              <h3 className="text-[18px] font-[600] text-[#1D1D1F] tracking-tight">全局热门推荐</h3>
            </div>
            <button onClick={loadStats} className="text-[#6E6E73] hover:text-[#0071E3] transition-colors">
              <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {statsLoading && globalStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#6E6E73]">
              <div className="w-6 h-6 border-2 border-[#0071E3]/20 border-t-[#0071E3] rounded-full animate-spin mb-3"></div>
              <span className="text-[14px]">载入统计中...</span>
            </div>
          ) : globalStats.length === 0 ? (
            <div className="text-center py-16 text-[#8E8E93] text-[14px]">
              <Disc className="w-10 h-10 mx-auto mb-3 opacity-30" />
              暂无全网热门，大家一起来听！
            </div>
          ) : (
            <div className="space-y-1">
              {globalStats.map((item, index) => (
                <div 
                  key={item.songId}
                  className="flex items-center gap-3 p-2.5 rounded-[12px] hover:bg-[#F5F5F7] group transition-colors cursor-pointer"
                  onClick={() => playStatSong(item)}
                >
                  <div className="w-6 text-[14px] font-bold text-[#8E8E93] text-center font-mono">
                    {index + 1}
                  </div>
                  <div className="relative w-10 h-10 rounded-[6px] bg-[#EDEDF2] overflow-hidden shadow-sm shrink-0">
                    <CoverImage src={getProxiedCoverUrl(item.cover)} alt="Cover" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-[14px] font-[600] text-[#1D1D1F] leading-tight truncate group-hover:text-[#0071E3] transition-colors">{item.title}</p>
                    <p className="text-[12px] text-[#6E6E73] truncate mt-0.5">{item.artist}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[13px] font-[600] text-[#1D1D1F] block">{item.playCount} 次</span>
                    <span className="text-[10px] text-[#8E8E93] font-mono block mt-0.5">全网听过</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
