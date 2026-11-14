import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { isRecord } from './frames.js'

export class NativeHost {
  private readonly token = randomBytes(32).toString('hex')
  private child: ChildProcessWithoutNullStreams | undefined
  private address: string | undefined

  async start(command: string, args: string[], cwd: string): Promise<void> {
    const child = spawn(command, args, {
      cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      // The host stops by itself once this process is gone, however it went: in dev `child` is
      // `dotnet run`, and killing it, or Electron dying, would otherwise leave the host holding
      // the wheel screen.
      env: { ...process.env, SPRINT_DESKTOP_TOKEN: this.token, SPRINT_DESKTOP_PARENT_PID: String(process.pid) },
    })
    this.child = child
    child.stderr.on('data', (data: Buffer) => process.stderr.write(data))
    const lines = createInterface({ input: child.stdout })
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Native runtime did not become ready within 30 seconds.')), 30_000)
        const fail = (error: Error): void => { clearTimeout(timeout); reject(error) }
        child.once('error', fail)
        child.once('exit', (code) => fail(new Error(`Native runtime exited before readiness (${code}).`)))
        lines.on('line', (line: string) => {
          if (!line.startsWith('{') || line.length > 4096) return
          let message: unknown
          try { message = JSON.parse(line) } catch { return }
          if (!isRecord(message) || message.type !== 'ready' || typeof message.port !== 'number'
            || !Number.isInteger(message.port) || message.port < 1 || message.port > 65535) return
          this.address = `http://127.0.0.1:${message.port}`
          clearTimeout(timeout)
          resolve()
        })
      })
    } catch (error) {
      await this.stop()
      throw error
    } finally {
      lines.close()
      child.stdout.resume()
    }
  }

  async state(): Promise<unknown> { return this.json('/api/state') }

  /** Lap traces are far too large for the polled state payload. */
  async analysisTrace(sessionId: string, lapNumber: number): Promise<unknown> {
    return this.json(`/api/analysis/trace/${encodeURIComponent(sessionId)}/${encodeURIComponent(String(lapNumber))}`)
  }

  /**
   * The game's setups. The first call after launch reads every setup file the game stores —
   * hundreds — so it gets a minute rather than the default bound; later calls read only changes.
   */
  async setups(): Promise<unknown> {
    return this.json('/api/setups', undefined, 60_000)
  }

  /** One setup's values, as the file holds them now or as `version` held them. */
  async setupSheet(id: string, version: string | null): Promise<unknown> {
    const query = new URLSearchParams({ id })
    if (version) query.set('version', version)
    return this.json(`/api/setups/sheet?${query.toString()}`, undefined, 60_000)
  }

  async setupDriven(id: string): Promise<unknown> {
    return this.json(`/api/setups/driven?${new URLSearchParams({ id }).toString()}`, undefined, 60_000)
  }

  async diagnosticsLogs(minLevel: string, text: string): Promise<unknown> {
    const query = new URLSearchParams()
    if (minLevel) query.set('minLevel', minLevel)
    if (text) query.set('text', text)
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    return this.json(`/api/diagnostics/logs${suffix}`)
  }

  /** The plan dialogs' prefill, recorded game/car/track choices and Quick plan's detection; reads every lap-history file's context. */
  async planContext(): Promise<unknown> {
    return this.json('/api/planner/context', undefined, 30_000)
  }

  /** What a plan's targets can be, from its car and track's lap history; reads every lap-history file. */
  async planTargets(planId: string): Promise<unknown> {
    return this.json(`/api/planner/targets?planId=${encodeURIComponent(planId)}`, undefined, 30_000)
  }

  /** The plan dialogs' fuel calculator: the lap history for a car and track, and the race from what is typed. */
  async planFuelEstimate(request: Record<string, unknown>): Promise<unknown> {
    return this.json('/api/planner/fuel-estimate', { method: 'POST', body: JSON.stringify(request), headers: { 'content-type': 'application/json' } }, 30_000)
  }

  /**
   * Scans the game's results archive. A first run parses every file in it — hundreds of
   * XMLs — so this gets minutes rather than the default 5s request bound.
   */
  async resultsImportScan(includeDeclined: boolean): Promise<unknown> {
    return this.json(`/api/results-import/scan?includeDeclined=${includeDeclined ? 'true' : 'false'}`, { method: 'POST' }, 5 * 60_000)
  }

  async resultsImport(ids: readonly string[]): Promise<unknown> {
    return this.json(
      '/api/results-import/import',
      { method: 'POST', body: JSON.stringify({ ids }), headers: { 'content-type': 'application/json' } },
      5 * 60_000,
    )
  }

  async resultsImportDecline(ids: readonly string[]): Promise<void> {
    await this.request(
      '/api/results-import/decline',
      { method: 'POST', body: JSON.stringify({ ids }), headers: { 'content-type': 'application/json' } },
      60_000,
    )
  }

  /** Signing in waits on the Sprint server, not just the host, so it gets longer than the 5s bound. */
  async accountSignIn(serverUrl: string, email: string, password: string, createAccount: boolean): Promise<unknown> {
    return this.json(
      '/api/account/sign-in',
      { method: 'POST', body: JSON.stringify({ serverUrl, email, password, createAccount }), headers: { 'content-type': 'application/json' } },
      30_000,
    )
  }

  /** The server's public settings (is Discord sign-in on?); waits on the Sprint server. */
  async serverInfo(serverUrl: string): Promise<unknown> {
    return this.json('/api/cloud/server-info', { method: 'POST', body: JSON.stringify({ serverUrl }), headers: { 'content-type': 'application/json' } }, 15_000)
  }

  /** Starts a Discord sign-in: the host answers with the URL to open in the system browser, or a failed result. */
  async discordStart(serverUrl: string): Promise<unknown> {
    return this.json('/api/account/discord/start', { method: 'POST', body: JSON.stringify({ serverUrl }), headers: { 'content-type': 'application/json' } })
  }

  /** Waits for the browser leg; the host gives up after 5 minutes, so this is bounded just above that. */
  async discordWait(): Promise<unknown> {
    return this.json('/api/account/discord/wait', { method: 'POST' }, 6 * 60_000)
  }

  async discordCancel(): Promise<void> {
    await this.request('/api/account/discord/cancel', { method: 'POST' })
  }

  /** Sweeps the local network for Sprint servers; a few seconds, bounded well above that. */
  async cloudDiscover(): Promise<unknown> {
    return this.json('/api/cloud/discover', { method: 'POST' }, 60_000)
  }

  /** A first upload or download can carry a driver's whole history, so it gets minutes. */
  async cloudPush(): Promise<unknown> {
    return this.json('/api/cloud/push', { method: 'POST' }, 10 * 60_000)
  }

  async cloudPull(): Promise<unknown> {
    return this.json('/api/cloud/pull', { method: 'POST' }, 10 * 60_000)
  }

  async accountSignOut(): Promise<void> {
    await this.request('/api/account/sign-out', { method: 'POST' })
  }

  async telemetry(): Promise<unknown> { return this.json('/api/telemetry') }

  /** A lap of the linked driver's, gathered on this (the engineer's) PC; too large for the polled state. */
  async pitWallTrace(lap: 'current' | 'last' | 'best' | 'target'): Promise<unknown> {
    return this.json(`/api/pitwall/trace?lap=${lap}`)
  }

  /** `GET /api/debug`, the dev debug window's snapshot; a Debug host only (a Release one answers 404). */
  async debug(): Promise<unknown> { return this.json('/api/debug', undefined, 2000) }

  /** The training HUD's newest snapshot, or null when there is no lap to train against. */
  async compareFrame(): Promise<unknown> { return this.json('/api/compare/frame', undefined, 2000) }

  /** Where each training HUD window opens on these displays (primary first). */
  async hudWindows(displays: readonly { x: number; y: number; width: number; height: number }[]): Promise<unknown> {
    return this.json('/api/compare/hud/windows', { method: 'POST', body: JSON.stringify({ screens: displays }), headers: { 'content-type': 'application/json' } })
  }

  async command(command: unknown): Promise<unknown> {
    if (!isRecord(command) || typeof command.type !== 'string') throw new Error('A typed command is required.')
    return this.json('/api/commands', { method: 'POST', body: JSON.stringify(command), headers: { 'content-type': 'application/json' } })
  }

  /**
   * A lap as `.sprintlap` bytes, or the host's reason it cannot be shared (a lap with only a
   * time, one that was deleted). The filename is a suggestion for the save dialog.
   */
  async lapFile(sessionId: string, lapNumber: number): Promise<{ ok: true; bytes: Uint8Array; fileName: string } | { ok: false; error: string }> {
    if (!this.address) throw new Error('Native runtime is not ready.')
    const response = await fetch(`${this.address}/api/laps/${encodeURIComponent(sessionId)}/${encodeURIComponent(String(lapNumber))}/file`, {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      return { ok: false, error: isRecord(body) && typeof body.error === 'string' ? body.error : `Runtime ${response.status}` }
    }
    return {
      ok: true,
      bytes: new Uint8Array(await response.arrayBuffer()),
      fileName: decodeURIComponent(response.headers.get('x-lap-filename') ?? 'lap.sprintlap'),
    }
  }

  /** Reads a `.sprintlap` without filing it: what it holds and whether it is already here, or why it cannot be read. */
  async previewLap(bytes: Uint8Array<ArrayBuffer>): Promise<unknown> {
    return this.json('/api/laps/import/preview', { method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' } }, 60_000)
  }

  /** Files a `.sprintlap` into the corpus; the host answers with what it was, or why not. */
  async importLap(bytes: Uint8Array<ArrayBuffer>): Promise<unknown> {
    return this.json('/api/laps/import', { method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' } }, 60_000)
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    this.child = undefined
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit').then(() => undefined).catch(() => undefined)
    try { await this.request('/api/shutdown', { method: 'POST', signal: AbortSignal.timeout(2000) }) } catch { /* Exit is still required after failed startup. */ }
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([exited, new Promise<void>((resolve) => { timer = setTimeout(resolve, 3000) })])
    if (timer) clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await exited
    }
    this.address = undefined
  }

  private async json(path: string, options?: RequestInit, timeoutMs = 5000): Promise<unknown> {
    const response = await this.request(path, options, timeoutMs)
    if (response.status === 204) return null
    const body = await response.text()
    return body ? JSON.parse(body) : null
  }

  private async request(path: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
    if (!this.address) throw new Error('Native runtime is not ready.')
    const headers = new Headers(options.headers)
    headers.set('authorization', `Bearer ${this.token}`)
    const response = await fetch(`${this.address}${path}`, {
      ...options, headers,
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`Runtime ${response.status}: ${(await response.text()).slice(0, 500)}`)
    return response
  }
}
