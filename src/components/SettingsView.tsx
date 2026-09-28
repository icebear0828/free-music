import { useState } from 'react';
import { AlertCircle, Check, Loader2, MonitorSmartphone, Server, Sparkles } from 'lucide-react';
import { useFloatingLyrics } from './FloatingLyricsProvider';
import { useAppData } from './AppDataProvider';
import { ALL_SOURCES } from '../hooks/useLibrary';
import { DEFAULT_QUALITY_KEY } from '../constants/quality';
import { getServerBase, isNativeMobile, probeServer, setServerBase } from '../platform/runtime';

const SOURCE_LABELS: Record<string, string> = {
  xiaoqiu: '小秋',
  xiaowo: '小蜗',
  xiaoyun: '小芸',
  xiaogou: '小枸',
  xiaomi: '小蜜',
};

const QUALITY_CHOICES = [
  { value: 'low', label: '标准 (128kbps)' },
  { value: 'standard', label: '较高 (320kbps) — 推荐' },
  { value: 'flac', label: '无损 (FLAC)' },
  { value: 'wav', label: '原音轨 (WAV)' },
];

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#EDEDF2] rounded-[16px] p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-[15px] font-[600] text-[#1D1D1F] mb-4">
        {icon}
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[14px] text-[#1D1D1F] font-[500]">{label}</p>
        {hint && <p className="text-[12px] text-[#6E6E73] mt-0.5 leading-[17px]">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`w-[51px] h-[31px] rounded-full transition-colors relative shrink-0 disabled:opacity-40 ${
        checked ? 'bg-[#34C759]' : 'bg-[#E9E9EB]'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[20px]' : ''
        }`}
      />
    </button>
  );
}

export function SettingsView() {
  const floating = useFloatingLyrics();
  const { library } = useAppData();
  const [quality, setQuality] = useState(() => localStorage.getItem(DEFAULT_QUALITY_KEY) || 'standard');
  const [serverInput, setServerInput] = useState(getServerBase());
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<'ok' | 'fail' | null>(null);

  const saveServer = async () => {
    setProbing(true);
    setProbeResult(null);
    const reachable = await probeServer(serverInput);
    setProbing(false);
    setProbeResult(reachable ? 'ok' : 'fail');
    if (reachable) {
      setServerBase(serverInput);
      // The whole client caches nothing about the base URL beyond module state,
      // so a reload is the simplest way to re-issue every in-flight request.
      setTimeout(() => window.location.reload(), 600);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-8">
      <Section title="悬浮歌词" icon={<Sparkles className="w-[18px] h-[18px] text-[#0071E3]" />}>
        <Row
          label="开启悬浮歌词"
          hint={
            floating.supported
              ? floating.kind === 'android'
                ? '在其他应用之上显示歌词，需要「显示在其他应用上层」权限'
                : floating.kind === 'electron'
                ? '独立的透明置顶窗口，可拖动、可锁定鼠标穿透'
                : '使用浏览器文档画中画窗口显示歌词'
              : floating.unsupportedHint
          }
        >
          <Switch
            label="开启悬浮歌词"
            checked={floating.enabled}
            onChange={() => void floating.toggle()}
            disabled={!floating.supported}
          />
        </Row>

        {floating.error && (
          <div className="flex items-start gap-2 text-[12px] text-[#e30000] bg-[#e30000]/5 rounded-[10px] p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{floating.error}</span>
          </div>
        )}

        <Row label="显示翻译" hint="有翻译歌词时同时显示译文">
          <Switch
            label="显示翻译"
            checked={floating.style.showTranslation}
            onChange={() => floating.updateStyle({ showTranslation: !floating.style.showTranslation })}
          />
        </Row>

        {floating.kind !== 'android' && (
          <Row label="锁定（鼠标穿透）" hint="锁定后点击会穿透到下层窗口，悬停时仍可操作">
            <Switch
              label="锁定鼠标穿透"
              checked={floating.style.locked}
              onChange={() => floating.updateStyle({ locked: !floating.style.locked })}
            />
          </Row>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[14px] text-[#1D1D1F] font-[500]">字号</p>
            <span className="text-[12px] text-[#6E6E73] font-mono">{floating.style.fontSize}px</span>
          </div>
          <input
            type="range"
            min={16}
            max={64}
            step={1}
            value={floating.style.fontSize}
            onChange={(e) => floating.updateStyle({ fontSize: Number(e.target.value) })}
            className="w-full accent-[#0071E3]"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-[13px] text-[#333336]">
            歌词颜色
            <input
              type="color"
              value={floating.style.activeColor}
              onChange={(e) => floating.updateStyle({ activeColor: e.target.value })}
              className="w-8 h-8 rounded border border-[#EDEDF2] bg-transparent cursor-pointer"
            />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-[#333336]">
            译文颜色
            <input
              type="color"
              value={floating.style.color}
              onChange={(e) => floating.updateStyle({ color: e.target.value })}
              className="w-8 h-8 rounded border border-[#EDEDF2] bg-transparent cursor-pointer"
            />
          </label>
          <button
            onClick={floating.resetStyle}
            className="ml-auto text-[13px] text-[#0071E3] hover:underline"
          >
            恢复默认
          </button>
        </div>
      </Section>

      <Section title="音质与音源" icon={<MonitorSmartphone className="w-[18px] h-[18px] text-[#0071E3]" />}>
        <div>
          <p className="text-[14px] text-[#1D1D1F] font-[500] mb-2">默认音质</p>
          <select
            value={quality}
            onChange={(e) => {
              setQuality(e.target.value);
              localStorage.setItem(DEFAULT_QUALITY_KEY, e.target.value);
            }}
            className="w-full bg-white border border-[#D5D5D7] rounded-[10px] px-3 h-[44px] text-[14px] focus:outline-none focus:border-[#0071E3]"
          >
            {QUALITY_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-[14px] text-[#1D1D1F] font-[500] mb-2">搜索音源</p>
          <div className="flex flex-wrap gap-2">
            {ALL_SOURCES.map((source) => {
              const active = library.selectedSources.includes(source);
              return (
                <button
                  key={source}
                  onClick={() => library.toggleSource(source)}
                  className={`px-3 h-9 rounded-full text-[13px] font-[500] border transition-colors ${
                    active
                      ? 'bg-[#0071E3] text-white border-[#0071E3]'
                      : 'bg-white text-[#6E6E73] border-[#D5D5D7]'
                  }`}
                >
                  {SOURCE_LABELS[source] ?? source}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      {isNativeMobile && (
        <Section title="服务器地址" icon={<Server className="w-[18px] h-[18px] text-[#0071E3]" />}>
          <p className="text-[12px] text-[#6E6E73] leading-[18px]">
            移动端 App 需要连接运行在电脑上的 Music 服务端，填写局域网地址，例如
            <code className="mx-1 px-1 bg-[#F5F5F7] rounded">http://192.168.10.2:15000</code>。
          </p>
          <div className="flex gap-2">
            <input
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              placeholder="http://192.168.x.x:15000"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 min-w-0 bg-white border border-[#D5D5D7] rounded-[10px] px-3 h-[44px] text-[14px] focus:outline-none focus:border-[#0071E3]"
            />
            <button
              onClick={() => void saveServer()}
              disabled={probing || !serverInput.trim()}
              className="px-4 h-[44px] rounded-[10px] bg-[#0071E3] text-white text-[14px] font-[600] disabled:opacity-40 flex items-center gap-2"
            >
              {probing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              测试并保存
            </button>
          </div>
          {probeResult === 'ok' && <p className="text-[12px] text-[#34C759]">连接成功，正在重新载入…</p>}
          {probeResult === 'fail' && <p className="text-[12px] text-[#e30000]">无法连接，请检查地址与网络。</p>}
        </Section>
      )}
    </div>
  );
}
