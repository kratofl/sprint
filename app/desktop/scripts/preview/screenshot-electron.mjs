// Electron main entry for screenshot.mjs -- not meant to be run directly. Loads
// one preview URL in a hidden offscreen window, waits for the view to settle,
// writes a PNG and quits. Its job comes in SPRINT_SCREENSHOT as JSON:
// { url, out, width, height, userData, settleMs }.
import { writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow } from 'electron'

const job = JSON.parse(process.env.SPRINT_SCREENSHOT ?? '{}')

// Must happen before `ready`: the throwaway profile keeps the user's own Electron
// data (and the default app's userData folder) untouched.
app.setPath('userData', job.userData)
// One CSS pixel per image pixel, so a 1440x900 request is a 1440x900 PNG even on
// a Retina/HiDPI display.
app.commandLine.appendSwitch('force-device-scale-factor', '1')
// Keep Chromium away from the macOS keychain (a fresh profile would otherwise
// ask for "Electron Safe Storage" access).
app.commandLine.appendSwitch('use-mock-keychain')
app.dock?.hide()

async function capture() {
  const window = new BrowserWindow({
    show: false,
    width: job.width,
    height: job.height,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      // A hidden window would otherwise throttle the timers the view relies on to settle.
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  await window.loadURL(job.url)
  // Lets the async state load, the view switch and any `click=` steps settle
  // (the old headless-Edge capture used a 4s virtual-time budget).
  await delay(job.settleMs)
  const image = await window.webContents.capturePage()
  const { width, height } = image.getSize()
  if (width !== job.width || height !== job.height) {
    throw new Error(`captured ${width}x${height}, expected ${job.width}x${job.height}`)
  }
  writeFileSync(job.out, image.toPNG())
}

app.whenReady()
  .then(capture)
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    app.exit(1)
  })
