import { app, BrowserWindow, dialog, ipcMain, type BrowserWindowConstructorOptions, Menu, nativeTheme, shell, type IpcMainInvokeEvent, type IpcMainEvent, type WebContents } from 'electron'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isRecord, readScreenOutputs } from './frames.js'
import { NativeHost } from './native-host.js'
import { OffscreenOutputs } from './offscreen.js'
import { hudRouteFor, TrainingHud } from './hud.js'
import { HUD_CLOSED, readHudWanted } from './hudFeed.js'
import { macMenuTemplate } from './appMenu.js'
import { TRANSPARENT, windowChrome, windowLook, type WindowChrome } from './windowChrome.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const hostProject = path.resolve(desktopRoot, '..', 'Sprint.Desktop.Host', 'Sprint.Desktop.Host.csproj')
const STATE_POLL_INTERVAL_MS = 250
const X86_DOTNET = 'C:\\Program Files (x86)\\dotnet\\dotnet.exe'

/**
 * A bare `dotnet` on this machine can resolve to a runtime-only install with
 * no SDK, which makes `dotnet run` fail. Prefer an explicit override, then
 * verify the default actually resolves an SDK before trusting it, falling
 * back to the known x86 SDK install used elsewhere in this repo (Windows only).
 */
function resolveDotnetCommand(): string {
  const override = process.env.SPRINT_DOTNET_EXE
  if (override) return override
  const probe = spawnSync('dotnet', ['--list-sdks'], { windowsHide: true, encoding: 'utf8' })
  if (probe.status === 0 && probe.stdout.trim().length > 0) return 'dotnet'
  return process.platform === 'win32' && existsSync(X86_DOTNET) ? X86_DOTNET : 'dotnet'
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
    hud?.close()
    hud = undefined
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
let hud: TrainingHud | undefined

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
    // The HUD has no controls of its own and is click-through when locked; without the main
    // window nothing could turn it off, so it only shows while that window exists.
    hud?.reconcile(mainWindow ? readHudWanted(state) : HUD_CLOSED)
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

ipcMain.handle('sprint:account-sign-in', (_event: IpcMainInvokeEvent, serverUrl: unknown, email: unknown, password: unknown, createAccount: unknown) => {
  if (typeof serverUrl !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    throw new Error('A server address, email and password are required.')
  }
  return nativeHost.accountSignIn(serverUrl, email, password, createAccount === true)
})

ipcMain.handle('sprint:cloud-server-info', (_event: IpcMainInvokeEvent, serverUrl: unknown) => {
  if (typeof serverUrl !== 'string') throw new Error('A server address is required.')
  return nativeHost.serverInfo(serverUrl)
})

/**
 * Discord sign-in: the host builds the server's Discord URL (with its own loopback callback and a
 * nonce), this process opens it in the system browser — never in an Electron window, so the driver
 * signs in where their Discord session already is — and then waits for the host to report how it
 * ended. Sprint comes back to the front once signed in.
 */
ipcMain.handle('sprint:account-discord', async (_event: IpcMainInvokeEvent, serverUrl: unknown) => {
  if (typeof serverUrl !== 'string') throw new Error('A server address is required.')
  const started = await nativeHost.discordStart(serverUrl)
  if (!isRecord(started) || typeof started.authorizeUrl !== 'string') return started
  const url = new URL(started.authorizeUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    await nativeHost.discordCancel()
    return { outcome: 'Failed', error: 'The server returned an unexpected sign-in address.' }
  }
  try {
    await shell.openExternal(url.href)
  } catch {
    await nativeHost.discordCancel()
    return { outcome: 'Failed', error: 'Sprint could not open your browser.' }
  }
  const result = await nativeHost.discordWait()
  if (isRecord(result) && result.outcome === 'SignedIn') bringToFront()
  return result
})

ipcMain.handle('sprint:account-discord-cancel', () => nativeHost.discordCancel())
ipcMain.handle('sprint:account-sign-out', () => nativeHost.accountSignOut())
ipcMain.handle('sprint:cloud-discover', () => nativeHost.cloudDiscover())
ipcMain.handle('sprint:cloud-push', () => nativeHost.cloudPush())
ipcMain.handle('sprint:cloud-pull', () => nativeHost.cloudPull())

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

/** The lap file filter for both dialogs. The extension matches `SharedLapFile.Extension`. */
const LAP_FILE_FILTERS = [{ name: 'Sprint lap', extensions: ['sprintlap'] }]
const MAX_LAP_FILE_BYTES = 32 * 1024 * 1024

/** Saves a lap as a .sprintlap wherever the driver picks; the host only produces the bytes. */
ipcMain.handle('sprint:lap-export', async (event: IpcMainInvokeEvent, sessionId: unknown, lapNumber: unknown) => {
  if (typeof sessionId !== 'string' || typeof lapNumber !== 'number' || !Number.isInteger(lapNumber)) {
    throw new Error('A session id and lap number are required.')
  }
  const file = await nativeHost.lapFile(sessionId, lapNumber)
  if (!file.ok) return { outcome: 'failed', error: file.error }
  const owner = BrowserWindow.fromWebContents(event.sender)
  const options = {
    // The host's suggestion is a name only, never a path.
    defaultPath: path.join(app.getPath('downloads'), path.basename(file.fileName)),
    filters: LAP_FILE_FILTERS,
  }
  const choice = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
  if (choice.canceled || !choice.filePath) return { outcome: 'cancelled' }
  try {
    await writeFile(choice.filePath, file.bytes)
  } catch (error) {
    return { outcome: 'failed', error: error instanceof Error ? error.message : 'The file could not be written.' }
  }
  return { outcome: 'saved', fileName: path.basename(choice.filePath) }
})

/** Opens a .sprintlap a friend sent and files it into the corpus. */
ipcMain.handle('sprint:lap-import', async (event: IpcMainInvokeEvent) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  const options = { properties: ['openFile' as const], filters: LAP_FILE_FILTERS }
  const choice = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
  const filePath = choice.filePaths[0]
  if (choice.canceled || !filePath) return { outcome: 'cancelled' }
  try {
    if ((await stat(filePath)).size > MAX_LAP_FILE_BYTES) return { outcome: 'failed', error: 'That file is far too large to be a Sprint lap file.' }
    return await nativeHost.importLap(Uint8Array.from(await readFile(filePath)))
  } catch (error) {
    return { outcome: 'failed', error: error instanceof Error ? error.message : 'The file could not be read.' }
  }
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

ipcMain.on('sprint:hud-subscribe', (event: IpcMainEvent) => {
  hud?.resend(event.sender)
})

ipcMain.on('sprint:hud-resize', (event: IpcMainEvent, width: unknown, height: unknown, done: unknown) => {
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)) return
  hud?.resize(event.sender, width, height, done === true)
})

const isMac = process.platform === 'darwin'
/** The look the main window wears. Follows the OS, except after the dev toggle (`toggleLook`). */
let look = windowLook(process.platform)
let mainWindow: BrowserWindow | undefined

/** After a browser sign-in: the browser has focus, and the result is in Sprint. */
function bringToFront(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (isMac) app.focus({ steal: true })
}

function currentChrome(): WindowChrome {
  const dark = nativeTheme.shouldUseDarkColors
  const reducedTransparency = nativeTheme.prefersReducedTransparency
  return look === 'mac'
    ? windowChrome({ look, dark, reducedTransparency, vibrancySupported: isMac })
    : windowChrome({ look, dark })
}

/**
 * Dev only: reopen the main window in the other look (brand or macOS), so both can be checked on
 * one machine. A reopen rather than a restyle, because the caption buttons, traffic
 * lights and backdrop are fixed when a window is created. The new window opens
 * before the old one closes, so `window-all-closed` never stops the host.
 */
function toggleLook(): void {
  const previous = mainWindow
  look = look === 'mac' ? 'windows' : 'mac'
  const next = createWindow()
  if (previous) {
    next.setBounds(previous.getBounds())
    previous.destroy()
  }
}

/** ⌘⌥⇧L on macOS, Ctrl+Alt+Shift+L elsewhere: `TOGGLE_LOOK_ACCELERATOR` in appMenu.ts. */
function isToggleLookKey(input: Electron.Input): boolean {
  return input.type === 'keyDown' && input.key.toLowerCase() === 'l' && input.alt && input.shift && (isMac ? input.meta : input.control)
}

/** Height of the renderer's toolbar (styles.css `.titlebar`), the window title bar, including its 1px bottom edge. */
const TITLE_BAR_HEIGHT = 48

/**
 * Height of the caption buttons' overlay. One pixel short of the toolbar: the overlay paints its own
 * background over the page, and at full height it would hide the toolbar's bottom edge beneath it.
 */
const CAPTION_BUTTONS_HEIGHT = TITLE_BAR_HEIGHT - 1

/**
 * macOS traffic lights, as the top-left of the close button. The renderer's
 * toolbar band is 52px tall and reserves the first 80px of the sidebar header
 * for the buttons. Each button is a 14px square, so y = (52 - 14) / 2 = 19
 * centres them on the band. The buttons sit 23px apart on macOS 26+ (20px
 * before), so x = 16 ends the zoom button at 76px, inside the 80px.
 */
const TRAFFIC_LIGHT_POSITION = { x: 16, y: 19 }

/** BrowserWindow options that differ between the brand and macOS looks. */
function chromeOptions(chrome: WindowChrome): BrowserWindowConstructorOptions {
  switch (chrome.kind) {
    case 'solid':
      return {
        // The brand background, so nothing flashes before the renderer paints the same colour.
        backgroundColor: chrome.background,
        // The app's 48px toolbar is the window title bar. Hiding the OS one but keeping
        // its caption buttons as an overlay retains the real Windows minimise,
        // snap/maximise and close — including the Snap Layouts flyout, which a drawn
        // HTML button cannot offer.
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: chrome.background, symbolColor: chrome.symbol, height: CAPTION_BUTTONS_HEIGHT },
      }
    case 'vibrancy':
    case 'opaque':
      return {
        // The renderer paints its content opaque and leaves the sidebar transparent,
        // so the sidebar shows the vibrancy material — or, with Reduce Transparency,
        // the solid sidebar colour drawn here.
        backgroundColor: chrome.kind === 'vibrancy' ? TRANSPARENT : chrome.background,
        ...(chrome.kind === 'vibrancy' ? { vibrancy: 'sidebar' as const, visualEffectState: 'followWindow' as const } : {}),
        // No OS title bar: the real traffic lights float over the sidebar header,
        // and the renderer's toolbar is the drag region.
        titleBarStyle: 'hidden',
        trafficLightPosition: TRAFFIC_LIGHT_POSITION,
      }
  }
}

/** Live counterpart of `chromeOptions` for an already open window. */
function applyChrome(window: BrowserWindow, chrome: WindowChrome): void {
  switch (chrome.kind) {
    case 'solid':
      window.setBackgroundColor(chrome.background)
      // Windows/Linux only; macOS reaches this in the dev look toggle.
      if (!isMac) window.setTitleBarOverlay({ color: chrome.background, symbolColor: chrome.symbol, height: CAPTION_BUTTONS_HEIGHT })
      return
    case 'vibrancy':
      window.setVibrancy('sidebar')
      window.setBackgroundColor(TRANSPARENT)
      return
    case 'opaque':
      if (isMac) window.setVibrancy(null)
      window.setBackgroundColor(chrome.background)
      return
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    ...chromeOptions(currentChrome()),
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
  mainWindow = window
  window.once('closed', () => {
    if (mainWindow !== window) return
    mainWindow = undefined
    hud?.close()
  })
  // The Windows look on a Mac (dev toggle): the traffic lights would sit on its title
  // and icon, so hide them. ⌘W and ⌘Q still close the window.
  if (isMac && look === 'windows') window.setWindowButtonVisibility(false)
  if (!app.isPackaged) {
    window.webContents.on('before-input-event', (event, input) => {
      if (!isToggleLookKey(input)) return
      event.preventDefault()
      toggleLook()
    })
  }
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

  // The background and caption buttons follow the OS light/dark switch, and the macOS
  // vibrancy follows "Reduce transparency", live.
  const onThemeUpdated = (): void => applyChrome(window, currentChrome())
  nativeTheme.on('updated', onThemeUpdated)
  window.once('closed', () => nativeTheme.off('updated', onThemeUpdated))

  const devServerUrl = process.env.SPRINT_DESKTOP_DEV_SERVER_URL
  // `?backdrop=window` tells the renderer it is the main window, drawn over the
  // backdrop above (the offscreen dash pages and the preview harness are not).
  // `?platform=` picks the look the chrome above was built for.
  const query = { backdrop: 'window', platform: look }
  if (devServerUrl) {
    const url = new URL(devServerUrl)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(path.join(desktopRoot, 'dist', 'index.html'), { query })
  }
  return window
}

app.setName('Sprint')
// A dev run (scripts/dev.mjs) keeps the browser profile with the host's data in its own checkout,
// away from the installed app's. The host reads the same variable.
const dataRoot = process.env.SPRINT_DESKTOP_DATA_ROOT
if (dataRoot) app.setPath('userData', dataRoot)
// Windows groups taskbar entries and resolves their icon by this id; without it
// a dev run is filed under Electron's own identity and icon.
if (process.platform === 'win32') app.setAppUserModelId('com.sprint.desktop')

async function bootstrap(): Promise<void> {
  await app.whenReady()
  // No OS menu bar on Windows: every command this app has lives in its own UI.
  // macOS needs the standard menu for Quit, Hide, window keys and text editing.
  Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate(macMenuTemplate({ packaged: app.isPackaged, onToggleLook: toggleLook })) : null)
  // A packaged build gets its icon from the bundle. A dev run may be Electron's own
  // bundle (`pnpm start`), so set it here; the Dock shows this image unmasked, hence
  // the version already shaped and inset to Apple's icon grid.
  if (isMac && !app.isPackaged) app.dock?.setIcon(path.join(desktopRoot, 'resources', 'icon-mac.png'))
  await startNativeHost()
  offscreen = new OffscreenOutputs(
    rendererBaseUrl(),
    path.join(__dirname, 'preload.cjs'),
    (deviceId, frame, signal) => nativeHost.frame(deviceId, frame, signal),
    (deviceId, error) => { console.error(`[sprint] frame delivery failed for ${deviceId}:`, error) },
  )
  const baseUrl = rendererBaseUrl()
  hud = new TrainingHud(
    (windowId) => hudRouteFor(baseUrl, windowId),
    path.join(__dirname, 'preload.cjs'),
    {
      windows: (displays) => nativeHost.hudWindows(displays),
      frame: () => nativeHost.compareFrame(),
      command: (command) => nativeHost.command(command),
    },
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
