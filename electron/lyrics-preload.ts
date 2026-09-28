import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './ipc.js';
import type { LyricsCommand, LyricsSnapshot, LyricsStyle } from '../src/platform/types.js';

contextBridge.exposeInMainWorld('desktopLyrics', {
  onSnapshot: (handler: (snapshot: LyricsSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: LyricsSnapshot) => handler(snapshot);
    ipcRenderer.on(IPC.lyricsSnapshot, listener);
    return () => ipcRenderer.removeListener(IPC.lyricsSnapshot, listener);
  },
  onStyle: (handler: (style: LyricsStyle) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, style: LyricsStyle) => handler(style);
    ipcRenderer.on(IPC.lyricsStyle, listener);
    return () => ipcRenderer.removeListener(IPC.lyricsStyle, listener);
  },
  send: (command: LyricsCommand) => ipcRenderer.send(IPC.lyricsCommand, command),
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send(IPC.lyricsIgnoreMouse, ignore),
});
