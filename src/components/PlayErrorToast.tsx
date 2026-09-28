import { useEffect } from 'react';
import { usePlayer } from './PlayerProvider';

export function PlayErrorToast() {
  const { playError, clearPlayError } = usePlayer();

  useEffect(() => {
    if (!playError) return;
    const timer = setTimeout(() => clearPlayError(), 5000);
    return () => clearTimeout(timer);
  }, [playError, clearPlayError]);

  if (!playError) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-[#1E1E20]/96 backdrop-blur-xl text-white rounded-[14px] px-5 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] max-w-[min(420px,calc(100vw-32px))]"
      style={{ bottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}
      role="alert"
    >
      <span className="text-[20px] shrink-0">⚠️</span>
      <div className="min-w-0">
        <div className="font-[600] text-[14px] mb-0.5 truncate">{playError.title}</div>
        <div className="text-[12px] text-white/65 leading-[17px]">{playError.message}</div>
      </div>
      <button
        onClick={clearPlayError}
        className="text-white/50 hover:text-white text-[18px] shrink-0 pl-2 leading-none"
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  );
}
