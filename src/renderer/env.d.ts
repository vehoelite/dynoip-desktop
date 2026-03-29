/// <reference types="vite/client" />

interface ElectronAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (callback: (maximized: boolean) => void) => () => void
  openExternal: (url: string) => void
  getTokens: () => Promise<{ access_token: string | null; refresh_token: string | null }>
  setTokens: (tokens: { access_token: string; refresh_token: string }) => void
  clearTokens: () => void
  newtStatus: (key: string) => Promise<{ installed: boolean; running: boolean }>
  newtInstall: () => Promise<{ ok: boolean; path: string }>
  newtStart: (args: { key: string; endpoint: string; newtId: string; newtSecret: string }) => Promise<{ ok: boolean; pid?: number; message?: string }>
  newtStop: (key: string) => Promise<{ ok: boolean; message?: string }>
  newtLogs: (key: string) => Promise<string[]>
  platform: string
}

interface Window {
  electron: ElectronAPI
}
