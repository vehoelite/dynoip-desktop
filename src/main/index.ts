import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, session } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream, readFileSync, writeFileSync } from 'fs'
import { ChildProcess, spawn } from 'child_process'
import { randomBytes } from 'crypto'
import https from 'https'
import http from 'http'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'

// Anti-flicker: stabilise GPU compositing on Windows
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-gpu-vsync')
app.commandLine.appendSwitch('disable-frame-rate-limit')

/** Machine-unique encryption key — generated once, stored alongside electron-store data. */
function getEncryptionKey(): string {
  const keyPath = join(app.getPath('userData'), '.store-key')
  try {
    return readFileSync(keyPath, 'utf-8').trim()
  } catch {
    const key = randomBytes(32).toString('hex')
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(keyPath, key, { mode: 0o600 })
    return key
  }
}

function createStore() {
  try {
    return new Store<{
      access_token?: string
      refresh_token?: string
      activeNewts?: Array<{ key: string; endpoint: string; newtId: string; newtSecret: string }>
    }>({ encryptionKey: getEncryptionKey() })
  } catch {
    // Existing store was encrypted with old key — wipe and start fresh
    const storePath = join(app.getPath('userData'), 'config.json')
    try { writeFileSync(storePath, '{}', 'utf-8') } catch { /* ignore */ }
    return new Store<{
      access_token?: string
      refresh_token?: string
      activeNewts?: Array<{ key: string; endpoint: string; newtId: string; newtSecret: string }>
    }>({ encryptionKey: getEncryptionKey() })
  }
}

const store = createStore()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0a0a12',
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundThrottling: false,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      webSecurity: true
    }
  })

  // Right-click context menu (Copy / Paste / Cut / Select All)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = []
    if (params.isEditable) {
      menuItems.push({ label: 'Cut', role: 'cut', enabled: params.editFlags.canCut })
      menuItems.push({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy })
      menuItems.push({ label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste })
      menuItems.push({ type: 'separator' })
      menuItems.push({ label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll })
    } else if (params.selectionText) {
      menuItems.push({ label: 'Copy', role: 'copy' })
      menuItems.push({ type: 'separator' })
      menuItems.push({ label: 'Select All', role: 'selectAll' })
    } else {
      menuItems.push({ label: 'Select All', role: 'selectAll' })
    }
    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup()
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (is.dev) mainWindow?.webContents.openDevTools({ mode: 'bottom' })
  })

  // Close to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // Forward maximize state to renderer for titlebar button updates
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false)
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })

  tray = new Tray(icon)
  tray.setToolTip('DynoIP — Dynamic DNS & Secure Tunnels')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show DynoIP',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

// ── Window Control IPC ──────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// Open external links in default browser
ipcMain.on('open-external', (_event, url: string) => {
  shell.openExternal(url)
})

// ── Token Persistence IPC ───────────────────────────────────────────────────
ipcMain.handle('store:getTokens', () => {
  return {
    access_token: store.get('access_token') ?? null,
    refresh_token: store.get('refresh_token') ?? null
  }
})

ipcMain.on('store:setTokens', (_event, tokens: { access_token: string; refresh_token: string }) => {
  store.set('access_token', tokens.access_token)
  store.set('refresh_token', tokens.refresh_token)
})

ipcMain.on('store:clearTokens', () => {
  store.delete('access_token')
  store.delete('refresh_token')
  // Kill active tunnels and clear persisted credentials on logout
  for (const [, inst] of newtInstances) {
    inst.stoppedByUser = true
    inst.process.kill()
  }
  newtInstances.clear()
  store.delete('activeNewts')
})

// ── Newt Agent Management ───────────────────────────────────────────────────
const NEWT_VERSION = '1.10.3'

interface NewtArgs { key: string; endpoint: string; newtId: string; newtSecret: string }
interface NewtInstance {
  process: ChildProcess
  args: NewtArgs
  restarts: number
  startedAt: number
  stoppedByUser: boolean
}
const newtInstances = new Map<string, NewtInstance>()
const newtLogs = new Map<string, string[]>()

/** Persist active tunnel args so we can auto-reconnect on app launch */
function persistActiveNewts(): void {
  const active: NewtArgs[] = []
  for (const [, inst] of newtInstances) {
    if (!inst.stoppedByUser) active.push(inst.args)
  }
  store.set('activeNewts', active)
}

function getPersistedNewts(): NewtArgs[] {
  return store.get('activeNewts') ?? []
}

function getNewtDir(): string {
  const dir = join(app.getPath('userData'), 'newt')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getNewtBin(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return join(getNewtDir(), `newt${ext}`)
}

function getNewtDownloadUrl(): string {
  const plat = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'
  const ext = process.platform === 'win32' ? '.exe' : ''
  return `https://github.com/fosrl/newt/releases/download/${NEWT_VERSION}/newt_${plat}_amd64${ext}`
}

/** Follow redirects (GitHub releases redirect to S3) */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (u: string, depth: number): void => {
      if (depth > 5) { reject(new Error('Too many redirects')); return }
      const lib = u.startsWith('https') ? https : http
      lib.get(u, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location, depth + 1)
          return
        }
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`))
          return
        }
        const file = createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', (err) => { file.close(); reject(err) })
      }).on('error', reject)
    }
    follow(url, 0)
  })
}

function appendLog(key: string, line: string): void {
  let logs = newtLogs.get(key)
  if (!logs) { logs = []; newtLogs.set(key, logs) }
  logs.push(line)
  if (logs.length > 200) logs.splice(0, logs.length - 200)
}

/** Spawn a Newt process with auto-restart on unexpected exit */
function spawnNewt(args: NewtArgs, restarts = 0): NewtInstance {
  const bin = getNewtBin()
  newtLogs.set(args.key, newtLogs.get(args.key) ?? [])

  const child = spawn(bin, [
    '--endpoint', args.endpoint,
    '--id', args.newtId,
    '--secret', args.newtSecret
  ], {
    windowsHide: true,
  })

  const inst: NewtInstance = {
    process: child,
    args,
    restarts,
    startedAt: Date.now(),
    stoppedByUser: false,
  }
  newtInstances.set(args.key, inst)
  persistActiveNewts()

  child.stdout?.on('data', (data: Buffer) => appendLog(args.key, data.toString()))
  child.stderr?.on('data', (data: Buffer) => appendLog(args.key, data.toString()))

  child.on('exit', (code) => {
    appendLog(args.key, `[process exited with code ${code}]`)
    // Auto-restart unless user explicitly stopped, app is quitting, or too many rapid restarts
    if (inst.stoppedByUser || isQuitting) return
    // Reset restart counter if the process ran for >60s (was stable)
    const uptime = Date.now() - inst.startedAt
    const nextRestarts = uptime > 60_000 ? 0 : inst.restarts + 1
    if (nextRestarts > 10) {
      appendLog(args.key, '[auto-restart] giving up after 10 rapid restarts')
      return
    }
    const delay = Math.min(1000 * Math.pow(2, nextRestarts), 30_000) // 1s, 2s, 4s … 30s
    appendLog(args.key, `[auto-restart] reconnecting in ${delay / 1000}s (attempt ${nextRestarts + 1})`)
    setTimeout(() => {
      if (isQuitting) return
      const current = newtInstances.get(args.key)
      if (current && current.stoppedByUser) return
      spawnNewt(args, nextRestarts)
    }, delay)
  })

  child.on('error', (err) => {
    appendLog(args.key, `[error] ${err.message}`)
  })

  return inst
}

ipcMain.handle('newt:status', (_event, key: string) => {
  const installed = existsSync(getNewtBin())
  const inst = newtInstances.get(key)
  const running = !!inst && !inst.process.killed && inst.process.exitCode === null
  return { installed, running }
})

ipcMain.handle('newt:install', async () => {
  const dest = getNewtBin()
  if (existsSync(dest)) return { ok: true, path: dest }
  const url = getNewtDownloadUrl()
  await downloadFile(url, dest)
  // Make executable on non-Windows
  if (process.platform !== 'win32') {
    const { chmodSync } = await import('fs')
    chmodSync(dest, 0o755)
  }
  return { ok: true, path: dest }
})

ipcMain.handle(
  'newt:start',
  async (
    _event,
    args: { key: string; endpoint: string; newtId: string; newtSecret: string }
  ) => {
    const existing = newtInstances.get(args.key)
    if (existing && !existing.process.killed && existing.process.exitCode === null) {
      return { ok: true, message: 'Already running' }
    }
    const bin = getNewtBin()
    if (!existsSync(bin)) throw new Error('Newt binary not installed — call newt:install first')

    const inst = spawnNewt(args)
    return { ok: true, pid: inst.process.pid }
  }
)

ipcMain.handle('newt:stop', (_event, key: string) => {
  const inst = newtInstances.get(key)
  if (!inst || inst.process.killed || inst.process.exitCode !== null) {
    newtInstances.delete(key)
    persistActiveNewts()
    return { ok: true, message: 'Not running' }
  }
  inst.stoppedByUser = true // prevent auto-restart
  inst.process.kill()
  newtInstances.delete(key)
  persistActiveNewts()
  return { ok: true }
})

ipcMain.handle('newt:logs', (_event, key: string) => {
  return newtLogs.get(key) ?? []
})

// ── Single Instance Lock ────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.dynoip.desktop')

    app.on('browser-window-created', (_, window) => {
      if (is.dev) optimizer.watchWindowShortcuts(window)
    })

    // CSP: remove restrictions in dev (Vite needs full access), enforce in prod
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (is.dev) {
        // Strip any CSP so dev mode has no fetch restrictions
        const headers = { ...details.responseHeaders }
        delete headers['content-security-policy']
        delete headers['Content-Security-Policy']
        callback({ responseHeaders: headers })
      } else {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://dyno-ip.com https://api.ipify.org"
            ]
          }
        })
      }
    })

    createWindow()
    createTray()

    // Auto-reconnect tunnels that were active before last quit
    const saved = getPersistedNewts()
    if (saved.length && existsSync(getNewtBin())) {
      for (const args of saved) {
        if (!newtInstances.has(args.key)) {
          appendLog(args.key, '[auto-reconnect] restoring tunnel from previous session')
          spawnNewt(args)
        }
      }
    }
  })
}

app.on('before-quit', () => {
  isQuitting = true
  // Persist active tunnels before killing so they auto-reconnect on next launch
  persistActiveNewts()
  // Kill all Newt agent processes on quit
  for (const [, inst] of newtInstances) {
    inst.stoppedByUser = true // suppress auto-restart during shutdown
    if (!inst.process.killed && inst.process.exitCode === null) inst.process.kill()
  }
  newtInstances.clear()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
