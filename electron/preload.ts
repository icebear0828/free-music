import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './ipc.js';
import type { LyricsCommand, LyricsSnapshot, LyricsStyle } from '../src/platform/types.js';

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  getInfo: () => ipcRenderer.invoke(IPC.appInfo),
  lyrics: {
    show: () => ipcRenderer.invoke(IPC.lyricsShow),
    hide: () => ipcRenderer.invoke(IPC.lyricsHide),
    isVisible: () => ipcRenderer.invoke(IPC.lyricsIsVisible),
    update: (snapshot: LyricsSnapshot) => ipcRenderer.invoke(IPC.lyricsUpdate, snapshot),
    setStyle: (style: LyricsStyle) => ipcRenderer.invoke(IPC.lyricsSetStyle, style),
    onCommand: (handler: (command: LyricsCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: LyricsCommand) => handler(command);
      ipcRenderer.on(IPC.lyricsCommand, listener);
      return () => ipcRenderer.removeListener(IPC.lyricsCommand, listener);
    },
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
  },
});
