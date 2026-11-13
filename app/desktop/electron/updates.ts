import type { WebContents } from 'electron'
import electronUpdater from 'electron-updater'
import { followUp, readUpdateSettings, type UpdateSettings, type UpdateStatus } from './updatePolicy.js'

/**
 * Sprint's self-update, on electron-updater against the GitHub Releases the release workflow
 * publishes (`latest.yml` + the NSIS installer). Only an installed Windows build updates; a dev
 * run or another platform reports `unsupported` and never touches the network.
 *
 * The driver's settings live in the host, so they arrive through the state poll (`reconcile`):
 * the first read starts the startup check. With automatic installs on, an update downloads in the
 * background and installs when Sprint quits; off, it waits for the driver to start it.
 */
export class Updates {
  private status: UpdateStatus
  private settings: UpdateSettings | null = null
  private readonly subscribers = new Set<WebContents>()
  private readonly updater = electronUpdater.autoUpdater

  /** `beforeInstall` stops the host, so the installer finds no running file to replace. */
  constructor(supported: boolean, private readonly beforeInstall: () => Promise<void>) {
    this.status = supported ? { kind: 'idle' } : { kind: 'unsupported' }
    if (!supported) return
    // Whatever was downloaded installs on quit: on its own with automatic installs on, or after
    // the driver asked for it with them off.
    this.updater.autoInstallOnAppQuit = true
    this.updater.autoDownload = false
    this.updater.on('checking-for-update', () => this.set({ kind: 'checking' }))
    this.updater.on('update-not-available', () => this.set({ kind: 'up-to-date' }))
    this.updater.on('update-available', (info) => {
      this.set(this.updater.autoDownload ? { kind: 'downloading', version: info.version, percent: 0 } : { kind: 'available', version: info.version })
    })
    this.updater.on('download-progress', (progress) => {
      const version = 'version' in this.status ? this.status.version : ''
      this.set({ kind: 'downloading', version, percent: Math.round(progress.percent) })
    })
    this.updater.on('update-downloaded', (info) => this.set({ kind: 'ready', version: info.version }))
    this.updater.on('error', (error) => this.set({ kind: 'failed', reason: error.message }))
  }

  /** Called with every polled host state. */
  reconcile(state: unknown): void {
    if (this.status.kind === 'unsupported') return
    const next = readUpdateSettings(state)
    if (!next) return
    const previous = this.settings
    this.settings = next
    this.updater.allowPrerelease = next.prerelease
    this.updater.autoDownload = next.autoInstall
    switch (followUp(previous, next, this.status)) {
      case 'check': void this.check(); break
      case 'download': void this.download(); break
      case 'none': break
    }
  }

  async check(): Promise<void> {
    const kind = this.status.kind
    if (kind === 'unsupported' || kind === 'checking' || kind === 'downloading' || kind === 'ready') return
    // A rejection is also an `error` event, which is what the driver sees.
    await this.updater.checkForUpdates().catch(() => undefined)
  }

  async download(): Promise<void> {
    if (this.status.kind !== 'available') return
    this.set({ kind: 'downloading', version: this.status.version, percent: 0 })
    await this.updater.downloadUpdate().catch(() => undefined)
  }

  /** Installs the downloaded update now and starts the new version. */
  async restart(): Promise<void> {
    if (this.status.kind !== 'ready') return
    await this.beforeInstall()
    this.updater.quitAndInstall(true, true)
  }

  /** A renderer gets the current status straight away, then every change. */
  subscribe(contents: WebContents): void {
    this.subscribers.add(contents)
    contents.once('destroyed', () => this.subscribers.delete(contents))
    contents.send('sprint:updates', this.status)
  }

  private set(status: UpdateStatus): void {
    this.status = status
    for (const contents of this.subscribers) {
      if (!contents.isDestroyed()) contents.send('sprint:updates', status)
    }
  }
}
