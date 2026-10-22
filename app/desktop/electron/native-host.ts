import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { isRecord, type PixelFrame } from './frames.js'

export class NativeHost {
  private readonly token = randomBytes(32).toString('hex')
  private child: ChildProcessWithoutNullStreams | undefined
  private address: string | undefined

  async start(command: string, args: string[], cwd: string): Promise<void> {
    const child = spawn(command, args, {
      cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, SPRINT_DESKTOP_TOKEN: this.token },
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

  async diagnosticsLogs(minLevel: string, text: string): Promise<unknown> {
    const query = new URLSearchParams()
    if (minLevel) query.set('minLevel', minLevel)
    if (text) query.set('text', text)
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    return this.json(`/api/diagnostics/logs${suffix}`)
  }

  /** The New plan dialog's prefill and recorded game/car/track choices; reads every lap-history file's context. */
  async planContext(): Promise<unknown> {
    return this.json('/api/planner/context', undefined, 30_000)
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

  async checkUpdates(force: boolean): Promise<unknown> {
    return this.json(`/api/updates/check?force=${force ? 'true' : 'false'}`, { method: 'POST' })
  }

  /**
   * Downloads and stages a release, then launches the self-replace helper (see
   * `Program.cs`'s `POST /api/updates/install`). A download can take a while on a slow
   * connection, so this gets a far more generous bound than the default 5s request
   * timeout; `signal` lets the caller still abort earlier if it wants to.
   */
  async installUpdate(target: { pid: number; installDir: string; exeName: string }, signal?: AbortSignal): Promise<unknown> {
    return this.json(
      '/api/updates/install',
      { method: 'POST', body: JSON.stringify(target), headers: { 'content-type': 'application/json' }, signal },
      5 * 60_000,
    )
  }
  async telemetry(): Promise<unknown> { return this.json('/api/telemetry') }
  async command(command: unknown): Promise<unknown> {
    if (!isRecord(command) || typeof command.type !== 'string') throw new Error('A typed command is required.')
    return this.json('/api/commands', { method: 'POST', body: JSON.stringify(command), headers: { 'content-type': 'application/json' } })
  }

  async frame(deviceId: string, frame: PixelFrame, signal: AbortSignal): Promise<void> {
    await this.request(`/api/screens/${encodeURIComponent(deviceId)}/frame`, {
      method: 'POST', body: frame.bytes, signal,
      headers: {
        'content-type': 'application/octet-stream',
        'x-frame-width': String(frame.width), 'x-frame-height': String(frame.height),
        'x-frame-sequence': String(frame.sequence),
      },
    })
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
