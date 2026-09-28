export const IPC = {
  lyricsShow: 'lyrics:show',
  lyricsHide: 'lyrics:hide',
  lyricsIsVisible: 'lyrics:is-visible',
  lyricsUpdate: 'lyrics:update',
  lyricsSetStyle: 'lyrics:set-style',
  /** overlay -> main -> main window */
  lyricsCommand: 'lyrics:command',
  /** main -> overlay */
  lyricsSnapshot: 'lyrics:snapshot',
  lyricsStyle: 'lyrics:style',
  lyricsStartDrag: 'lyrics:start-drag',
  lyricsIgnoreMouse: 'lyrics:ignore-mouse',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  appInfo: 'app:info',
} as const;
