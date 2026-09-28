import type { PlatformKind } from './types';

const SERVER_URL_KEY = 'music_server_url';

interface CapacitorGlobal {
  getPlatform(): string;
  isNativePlatform(): boolean;
}

function capacitorGlobal(): CapacitorGlobal | undefined {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap && typeof cap.getPlatform === 'function' ? cap : undefined;
}

export function detectPlatform(): PlatformKind {
  if (typeof window === 'undefined') return 'web';
  if (window.desktop || window.desktopLyrics) return 'electron';
  const cap = capacitorGlobal();
  if (cap?.isNativePlatform()) {
    const name = cap.getPlatform();
    if (name === 'android') return 'android';
    if (name === 'ios') return 'ios';
  }
  return 'web';
}

export const platform: PlatformKind = detectPlatform();
export const isElectron = platform === 'electron';
export const isAndroid = platform === 'android';
export const isIOS = platform === 'ios';
export const isNative = isElectron || isAndroid || isIOS;
export const isNativeMobile = isAndroid || isIOS;

/**
 * Native mobile builds load the UI from the app bundle, so relative `/api/...`
 * paths would resolve against `capacitor://localhost` instead of the backend.
 * Everything else (browser, Electron shell) is served by the Express server
 * itself, so an empty base keeps requests same-origin.
 */
let serverBase = '';

function normalizeBase(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export function getServerBase(): string {
  return serverBase;
}

export function setServerBase(url: string): void {
  serverBase = normalizeBase(url);
  try {
    if (serverBase) localStorage.setItem(SERVER_URL_KEY, serverBase);
    else localStorage.removeItem(SERVER_URL_KEY);
  } catch {
    // Storage can be unavailable in private browsing; the in-memory value still applies.
  }
}

export function initServerBase(): string {
  if (!isNativeMobile) {
    serverBase = '';
    return serverBase;
  }
  try {
    const saved = localStorage.getItem(SERVER_URL_KEY);
    if (saved) serverBase = normalizeBase(saved);
  } catch {
    // ignore
  }
  return serverBase;
}

initServerBase();

/** Resolve an app-relative API path against the active backend. */
export function apiUrl(path: string): string {
  if (!serverBase) return path;
  return path.startsWith('/') ? `${serverBase}${path}` : `${serverBase}/${path}`;
}

/** True when the app still needs the user to point it at a backend. */
export function needsServerConfig(): boolean {
  return isNativeMobile && !serverBase;
}

export async function probeServer(url: string): Promise<boolean> {
  const base = normalizeBase(url);
  if (!base) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
