import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void =>
      callback(maximized)
    ipcRenderer.on('window:maximized', handler)
    return () => {
      ipcRenderer.removeListener('window:maximized', handler)
    }
  },

  // External links
  openExternal: (url: string) => ipcRenderer.send('open-external', url),

  // Token persistence (electron-store via IPC)
  getTokens: (): Promise<{ access_token: string | null; refresh_token: string | null }> =>
    ipcRenderer.invoke('store:getTokens'),
  setTokens: (tokens: { access_token: string; refresh_token: string }) =>
    ipcRenderer.send('store:setTokens', tokens),
  clearTokens: () => ipcRenderer.send('store:clearTokens'),

  // Newt agent (hidden tunnel connector)
  newtStatus: (key: string): Promise<{ installed: boolean; running: boolean }> =>
    ipcRenderer.invoke('newt:status', key),
  newtInstall: (): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke('newt:install'),
  newtStart: (args: { key: string; endpoint: string; newtId: string; newtSecret: string }): Promise<{ ok: boolean; pid?: number; message?: string }> =>
    ipcRenderer.invoke('newt:start', args),
  newtStop: (key: string): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('newt:stop', key),
  newtLogs: (key: string): Promise<string[]> =>
    ipcRenderer.invoke('newt:logs', key),

  // Platform info
  platform: process.platform
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
