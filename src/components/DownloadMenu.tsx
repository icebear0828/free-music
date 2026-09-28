import { QUALITY_OPTIONS } from '../constants/quality';

const BADGE_CLASS: Record<string, string> = {
  MP3: 'bg-black/5 text-[#6E6E73]',
  FLAC: 'bg-blue-50 text-[#0071E3]',
  WAV: 'bg-amber-50 text-amber-700',
};

interface DownloadMenuProps {
  onSelect: (quality: string) => void;
  className?: string;
}

export function DownloadMenu({ onSelect, className = '' }: DownloadMenuProps) {
  return (
    <div
      className={`bg-white border border-[#EDEDF2] rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.15)] p-1.5 w-[190px] flex flex-col gap-0.5 text-[13px] text-left ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2 py-1 text-[11px] font-[600] text-[#8E8E93] border-b border-[#EDEDF2] mb-1 select-none">
        选择下载音质
      </div>
      {QUALITY_OPTIONS.map((option) => (
        <button
          key={option.id}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(option.id);
          }}
          className="w-full px-2 py-2 hover:bg-[#F5F5F7] hover:text-[#0071E3] rounded-[6px] text-left transition-colors flex items-center justify-between font-normal text-[#1D1D1F]"
        >
          <span>{option.label}</span>
          <span className={`text-[9px] px-1 py-0.5 rounded font-[700] ${BADGE_CLASS[option.badge]}`}>
            {option.badge}
          </span>
        </button>
      ))}
    </div>
  );
}
