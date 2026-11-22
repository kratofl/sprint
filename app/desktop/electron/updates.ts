import type { WebContents } from 'electron'
import electronUpdater from 'electron-updater'
import { checkAfter, isBusy, readUpdateSettings, type UpdateSettings, type UpdateStatus } from './updatePolicy.js'

/** While Sprint runs it looks for a new version this often. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

/** How long the launch waits on the check before it opens Sprint anyway (offline, slow network). */
const LAUNCH_CHECK_TIMEOUT_MS = 8000

/**
 * Sprint's self-update, on electron-updater against the GitHub Releases the release workflow
 * publishes (`latest.yml` + the NSIS installer). Only an installed Windows build updates; a dev
 * run or another platform reports `unsupported` and never touches the network.
 *
 * Two moments install: the launch (`atLaunch`), behind the splash, when automatic installs are on;
 * and the driver's click on the toolbar's update button (`install`). While Sprint runs it only
 * checks (`startChecking`), so nothing downloads in the middle of a session.
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
    // Nothing downloads or installs behind the driver's back: `install` does both, on purpose.
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.updater.on('checking-for-update', () => this.set({ kind: 'checking' }))
    this.updater.on('update-not-available', () => this.set({ kind: 'up-to-date' }))
    this.updater.on('update-available', (info) => this.set({ kind: 'available', version: info.version }))
    this.updater.on('download-progress', (progress) => {
      if (this.status.kind === 'downloading') this.set({ ...this.status, percent: Math.round(progress.percent) })
    })
    this.updater.on('error', (error) => this.set({ kind: 'failed', reason: error.message }))
  }

  get supported(): boolean {
    return this.status.kind !== 'unsupported'
  }

  /**
   * The launch, before the main window opens: with automatic installs on, a new version found now
   * downloads and installs straight away. True when Sprint is quitting into the installer; false
   * when it should open as usual (up to date, automatic installs off, offline, or the check took
   * too long — it may still finish and offer the update in the toolbar).
   */
  async atLaunch(state: unknown): Promise<boolean> {
    if (!this.supported) return false
    this.settings = readUpdateSettings(state)
    if (!this.settings) return false
    // Set either way: the first check while Sprint runs comes before the first poll.
    this.updater.allowPrerelease = this.settings.prerelease
    if (!this.settings.autoInstall) return false
    const checked = await Promise.race([
      this.check().then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), LAUNCH_CHECK_TIMEOUT_MS)),
    ])
    return checked ? this.install() : false
  }

  /** While Sprint runs: one check now unless the launch made one, then one an hour. Never downloads. */
  startChecking(): void {
    if (!this.supported) return
    if (this.status.kind === 'idle') void this.check()
    // An update already offered stays offered; checking again would only hide the button meanwhile.
    setInterval(() => {
      if (this.status.kind !== 'available') void this.check()
    }, CHECK_INTERVAL_MS)
  }

  /** Called with every polled host state. */
  reconcile(state: unknown): void {
    if (!this.supported) return
    const next = readUpdateSettings(state)
    if (!next) return
    const previous = this.settings
    this.settings = next
    this.updater.allowPrerelease = next.prerelease
    if (checkAfter(previous, next, this.status)) void this.check()
  }

  async check(): Promise<void> {
    if (!this.supported || isBusy(this.status)) return
    // A rejection is also an `error` event, which is what the driver sees.
    await this.updater.checkForUpdates().catch(() => undefined)
  }

  /**
   * Installs the version on offer: downloads it, stops the host and quits into the installer,
   * which starts the new version. False when there was nothing to install or the download failed.
   */
  async install(): Promise<boolean> {
    if (this.status.kind !== 'available') return false
    const version = this.status.version
    this.set({ kind: 'downloading', version, percent: 0 })
    // A failed download is also an `error` event, which the driver is told about; the version
    // stays on offer, so trying again is one more click.
    const downloaded = await this.updater.downloadUpdate().then(() => true, () => false)
    if (!downloaded) {
      this.set({ kind: 'available', version })
      return false
    }
    this.set({ kind: 'installing', version })
    await this.beforeInstall()
    this.updater.quitAndInstall(true, true)
    return true
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
