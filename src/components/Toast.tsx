import { useAppData } from './AppDataProvider';

export function Toast({ bottomOffset = 96 }: { bottomOffset?: number }) {
  const { toast, dismissToast } = useAppData();
  if (!toast) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-white/95 backdrop-blur-xl border border-[#EDEDF2] text-[#1D1D1F] px-4 py-3 rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.14)] max-w-[calc(100vw-32px)] sm:max-w-md"
      style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))` }}
      role="status"
    >
      <div className="w-2.5 h-2.5 rounded-full bg-[#0071E3] animate-pulse shrink-0" />
      <div className="flex-1 text-[14px] leading-[20px] font-semibold truncate">{toast.message}</div>
      {toast.actionText && toast.onAction && (
        <button
          onClick={() => {
            toast.onAction?.();
            dismissToast();
          }}
          className="text-[#0071E3] hover:text-[#0051A3] text-[14px] font-[600] shrink-0 hover:underline"
        >
          {toast.actionText}
        </button>
      )}
      <button
        onClick={dismissToast}
        className="text-[#8E8E93] hover:text-[#1D1D1F] text-[13px] font-[500] shrink-0 pl-2 border-l border-[#EDEDF2]"
      >
        关闭
      </button>
    </div>
  );
}
