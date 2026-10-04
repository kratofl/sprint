import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell, type IpcMainInvokeEvent, type IpcMainEvent, type WebContents } from 'electron'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isRecord, readScreenOutputs } from './frames.js'
import { NativeHost } from './native-host.js'
import { OffscreenOutputs } from './offscreen.js'
import { supportsMica, TRANSPARENT, windowChrome, type WindowChrome } from './windowChrome.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const hostProject = path.resolve(desktopRoot, '..', 'Sprint.Desktop.Host', 'Sprint.Desktop.Host.csproj')
const STATE_POLL_INTERVAL_MS = 250
const X86_DOTNET = 'C:\\Program Files (x86)\\dotnet\\dotnet.exe'

/**
 * A bare `dotnet` on this machine can resolve to a runtime-only install with
 * no SDK, which makes `dotnet run` fail. Prefer an explicit override, then
 * verify the default actually resolves an SDK before trusting it, falling
 * back to the known x86 SDK install used elsewhere in this repo.
 */
function resolveDotnetCommand(): string {
  const override = process.env.SPRINT_DOTNET_EXE
  if (override) return override
  const probe = spawnSync('dotnet', ['--list-sdks'], { windowsHide: true, encoding: 'utf8' })
  if (probe.status === 0 && probe.stdout.trim().length > 0) return 'dotnet'
  return existsSync(X86_DOTNET) ? X86_DOTNET : 'dotnet'
}

const nativeHost = new NativeHost()
let hostStartError: string | undefined

async function startNativeHost(): Promise<void> {
  try {
    await nativeHost.start(resolveDotnetCommand(), ['run', '--project', hostProject], path.dirname(hostProject))
  } catch (error) {
    hostStartError = error instanceof Error ? error.message : String(error)
    console.error('[sprint] native host failed to start:', error)
  }
}

let shutdownPromise: Promise<void> | undefined

/** Idempotent: safe to call from both window-all-closed and before-quit. */
function shutdown(): Promise<void> {
  if (!shutdownPromise) {
    polling = false
    if (pollTimer !== undefined) { clearTimeout(pollTimer); pollTimer = undefined }
    offscreen?.closeAll()
    offscreen = undefined
    shutdownPromise = nativeHost.stop().catch((error: unknown) => {
      console.error('[sprint] native host stop failed:', error)
    })
  }
  return shutdownPromise
}

// Renderers subscribed to state updates, polled at a modest rate and pushed
// over IPC. Polling stops entirely once nobody is listening.
const subscribers = new Set<WebContents>()
let pollTimer: ReturnType<typeof setTimeout> | undefined
let polling = false
let offscreen: OffscreenOutputs | undefined

function rendererBaseUrl(): string {
  const devServerUrl = process.env.SPRINT_DESKTOP_DEV_SERVER_URL
  if (devServerUrl) return devServerUrl
  return pathToFileURL(path.join(desktopRoot, 'dist', 'index.html')).href
}

function scheduleNextPoll(): void {
  pollTimer = setTimeout(() => { void pollTick() }, STATE_POLL_INTERVAL_MS)
}

async function pollTick(): Promise<void> {
  if (!polling) { pollTimer = undefined; return }
  try {
    const state = await nativeHost.state()
    for (const contents of subscribers) {
      if (!contents.isDestroyed()) contents.send('sprint:state', state)
    }
    // Dashboard output is driven from the same poll rather than from a renderer
    // subscription, so screens keep painting with the main window hidden.
    offscreen?.reconcile(readScreenOutputs(state))
  } catch (error) {
    console.error('[sprint] state poll failed:', error)
  }
  scheduleNextPoll()
}

function ensurePolling(): void {
  if (pollTimer === undefined && polling) scheduleNextPoll()
}

ipcMain.handle('sprint:get-state', () => nativeHost.state())

ipcMain.handle('sprint:analysis-trace', (_event: IpcMainInvokeEvent, sessionId: unknown, lapNumber: unknown) => {
  if (typeof sessionId !== 'string' || typeof lapNumber !== 'number' || !Number.isFinite(lapNumber)) {
    throw new Error('A session id and lap number are required.')
  }
  return nativeHost.analysisTrace(sessionId, lapNumber)
})

ipcMain.handle('sprint:diagnostics-logs', (_event: IpcMainInvokeEvent, minLevel: unknown, text: unknown) => {
  return nativeHost.diagnosticsLogs(typeof minLevel === 'string' ? minLevel : '', typeof text === 'string' ? text : '')
})

ipcMain.handle('sprint:plan-context', () => nativeHost.planContext())

/** Archive entry ids are opaque keys the host listed itself; the host re-checks them against its listing. */
const readEntryIds = (ids: unknown): string[] => {
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) {
    throw new Error('An array of entry ids is required.')
  }
  return ids
}

ipcMain.handle('sprint:results-import-scan', (_event: IpcMainInvokeEvent, includeDeclined: unknown) => {
  return nativeHost.resultsImportScan(includeDeclined === true)
})

ipcMain.handle('sprint:results-import', (_event: IpcMainInvokeEvent, ids: unknown) => {
  return nativeHost.resultsImport(readEntryIds(ids))
})

ipcMain.handle('sprint:results-import-decline', (_event: IpcMainInvokeEvent, ids: unknown) => {
  return nativeHost.resultsImportDecline(readEntryIds(ids))
})

ipcMain.handle('sprint:updates-check', (_event: IpcMainInvokeEvent, force: unknown) => {
  return nativeHost.checkUpdates(force === true)
})

/**
 * One-click self-replacing install (old app: `ConfirmAndInstallUpdate`/`InstallUpdate`).
 * Only the main process knows its own pid, install directory, and executable name — the
 * renderer never supplies them, so it cannot point the host's self-replace at anything else.
 * Refuses outright when not packaged: in a dev run `app.getPath('exe')` resolves to
 * `electron.exe` inside node_modules, and self-replacing that would corrupt the dev toolchain.
 */
ipcMain.handle('sprint:updates-install', async () => {
  if (!app.isPackaged) return { outcome: 'unavailable-in-dev' }
  const exePath = app.getPath('exe')
  const result = await nativeHost.installUpdate({
    pid: process.pid,
    installDir: path.dirname(exePath),
    exeName: path.basename(exePath),
  })
  // The staged self-replace batch waits for this process to exit before it can copy the new
  // build over the install directory, so the app must actually quit once staging succeeds.
  // Deferred one tick so the IPC reply above reaches the renderer before shutdown begins.
  if (isRecord(result) && result.outcome === 'Staged') {
    setImmediate(() => { void shutdown().finally(() => app.quit()) })
  }
  return result
})

ipcMain.handle('sprint:send-command', (_event: IpcMainInvokeEvent, command: unknown) => {
  if (!isRecord(command)) throw new Error('A command object is required.')
  return nativeHost.command(command)
})

ipcMain.on('sprint:subscribe', (event: IpcMainEvent) => {
  subscribers.add(event.sender)
  event.sender.once('destroyed', () => subscribers.delete(event.sender))
  ensurePolling()
})

ipcMain.on('sprint:unsubscribe', (event: IpcMainEvent) => {
  subscribers.delete(event.sender)
})

const micaSupported = supportsMica(process.platform, os.release())

function currentChrome(): WindowChrome {
  return windowChrome({
    dark: nativeTheme.shouldUseDarkColors,
    reducedTransparency: nativeTheme.prefersReducedTransparency,
    micaSupported,
  })
}

/** Height of the renderer's title bar (styles.css `.titlebar`); the caption buttons fill it. */
const TITLE_BAR_HEIGHT = 48

function createWindow(): BrowserWindow {
  const chrome = currentChrome()
  const background = chrome.kind === 'mica' ? TRANSPARENT : chrome.background
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    // The renderer leaves its window background transparent (see main.tsx), so the
    // title bar and navigation pane show whatever is drawn here: Mica, or its solid colour.
    backgroundColor: background,
    ...(micaSupported ? { backgroundMaterial: chrome.kind === 'mica' ? ('mica' as const) : ('none' as const) } : {}),
    // The app's 48px title bar is the window title bar. Hiding the OS one but keeping
    // its caption buttons as an overlay retains the real Windows minimise,
    // snap/maximise and close — including the Snap Layouts flyout, which a drawn
    // HTML button cannot offer.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: background, symbolColor: chrome.symbol, height: TITLE_BAR_HEIGHT },
    icon: path.join(desktopRoot, 'resources', 'icon.png'),
    webPreferences: {
      // Sandboxed preloads must be CommonJS (Electron rejects an ES-module preload
      // there), hence the .cts source compiled to preload.cjs.
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // Views link out with plain `target="_blank"` anchors (e.g. Settings/Help's "View
  // release"). Without a handler, Electron opens those in a second frameless Electron
  // window instead of the system browser. Deny every new-window request and hand
  // http(s) URLs to the OS browser instead; anything else (file:, javascript:, custom
  // schemes) is dropped rather than opened.
  window.webContents.setWindowOpenHandler(({ url }) => {
    let parsed: URL | undefined
    try {
      parsed = new URL(url)
    } catch {
      parsed = undefined
    }
    if (parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // The backdrop and caption buttons follow the OS light/dark switch and the
  // Windows "Transparency effects" setting live.
  const onThemeUpdated = (): void => {
    const next = currentChrome()
    const nextBackground = next.kind === 'mica' ? TRANSPARENT : next.background
    if (micaSupported) window.setBackgroundMaterial(next.kind === 'mica' ? 'mica' : 'none')
    window.setBackgroundColor(nextBackground)
    window.setTitleBarOverlay({ color: nextBackground, symbolColor: next.symbol, height: TITLE_BAR_HEIGHT })
  }
  nativeTheme.on('updated', onThemeUpdated)
  window.once('closed', () => nativeTheme.off('updated', onThemeUpdated))

  const devServerUrl = process.env.SPRINT_DESKTOP_DEV_SERVER_URL
  // `?backdrop=window` tells the renderer it is the main window, drawn over the
  // backdrop above (the offscreen dash pages and the preview harness are not).
  if (devServerUrl) {
    const url = new URL(devServerUrl)
    url.searchParams.set('backdrop', 'window')
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(path.join(desktopRoot, 'dist', 'index.html'), { query: { backdrop: 'window' } })
  }
  return window
}

app.setName('Sprint')
// Windows groups taskbar entries and resolves their icon by this id; without it
// a dev run is filed under Electron's own identity and icon.
if (process.platform === 'win32') app.setAppUserModelId('com.sprint.desktop')

async function bootstrap(): Promise<void> {
  await app.whenReady()
  // No OS menu bar: every command this app has lives in its own UI.
  Menu.setApplicationMenu(null)
  await startNativeHost()
  offscreen = new OffscreenOutputs(
    rendererBaseUrl(),
    (deviceId, frame, signal) => nativeHost.frame(deviceId, frame, signal),
    (deviceId, error) => { console.error(`[sprint] frame delivery failed for ${deviceId}:`, error) },
  )
  polling = true
  ensurePolling()
  const window = createWindow()
  if (hostStartError) {
    const message = `Sprint native host failed to start: ${hostStartError}`
    window.webContents.once('did-finish-load', () => {
      void window.webContents.executeJavaScript(`console.error(${JSON.stringify(message)})`)
    })
  }
}

app.on('window-all-closed', () => { void shutdown().finally(() => app.quit()) })
app.on('before-quit', () => { void shutdown() })

void bootstrap()
