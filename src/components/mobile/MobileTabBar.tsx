import { Download, Library, Search, User } from 'lucide-react';
import { useAppData } from '../AppDataProvider';

const TABS = [
  { id: 'search', label: '发现', Icon: Search },
  { id: 'library', label: '音乐库', Icon: Library },
  { id: 'downloads', label: '下载', Icon: Download },
  { id: 'profile', label: '我的', Icon: User },
];

/** Views that should keep a given tab highlighted while drilled in. */
function tabForView(view: string): string {
  if (view.startsWith('playlist_')) return 'library';
  if (view === 'remote_list') return 'search';
  if (view === 'settings') return 'profile';
  return view;
}

export function MobileTabBar() {
  const { view, setView } = useAppData();
  const activeTab = tabForView(view);

  return (
    <nav
      className="shrink-0 border-t border-[#EDEDF2] bg-white/92 backdrop-blur-xl flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex-1 h-[52px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? 'text-[#0071E3]' : 'text-[#8E8E93]'
            }`}
          >
            <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.4 : 1.8} />
            <span className={`text-[10px] ${active ? 'font-[600]' : 'font-[500]'}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
