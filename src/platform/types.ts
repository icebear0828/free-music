export type PlatformKind = 'web' | 'electron' | 'android' | 'ios';

/** A snapshot of what the floating lyrics surface should currently display. */
export interface LyricsSnapshot {
  title: string;
  artist: string;
  cover: string;
  line: string;
  translation: string;
  nextLine: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export interface LyricsStyle {
  fontSize: number;
  color: string;
  activeColor: string;
  background: string;
  bold: boolean;
  showTranslation: boolean;
  /** Click-through on desktop, non-interactive overlay on Android. */
  locked: boolean;
  opacity: number;
}

export type LyricsCommand =
  | 'play'
  | 'pause'
  | 'next'
  | 'prev'
  | 'close'
  | 'toggle'
  | 'lock'
  | 'unlock'
  | 'open-app';

export interface FloatingLyricsBridge {
  readonly kind: PlatformKind;
  /** Whether this build can put lyrics outside the app window at all. */
  readonly supported: boolean;
  /** Whether the surface needs an OS-level permission grant before it can show. */
  readonly needsPermission: boolean;
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  show(): Promise<void>;
  hide(): Promise<void>;
  isVisible(): Promise<boolean>;
  update(snapshot: LyricsSnapshot): Promise<void>;
  setStyle(style: LyricsStyle): Promise<void>;
  onCommand(handler: (command: LyricsCommand) => void): () => void;
}

export const DEFAULT_LYRICS_STYLE: LyricsStyle = {
  fontSize: 28,
  color: '#FFFFFF',
  activeColor: '#4EA1FF',
  background: 'rgba(0,0,0,0.35)',
  bold: true,
  showTranslation: true,
  locked: false,
  opacity: 1,
};

export const EMPTY_SNAPSHOT: LyricsSnapshot = {
  title: '',
  artist: '',
  cover: '',
  line: '',
  translation: '',
  nextLine: '',
  isPlaying: false,
  currentTime: 0,
  duration: 0,
};
