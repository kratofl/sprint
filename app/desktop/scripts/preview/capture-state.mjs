#!/usr/bin/env node
// Captures one real `/api/state` payload from the native host into
// `state.local.json` (gitignored: it is the user's own data) so the preview
// harness can render views with real content.
//
// Usage (from app/desktop, after `dotnet build app/Sprint.Desktop.Host -nodeReuse:false`):
//   node scripts/preview/capture-state.mjs [path/to/dotnet]
//
// Speaks the same readiness protocol Electron does (electron/native-host.ts):
// a per-launch bearer token in SPRINT_DESKTOP_TOKEN, then one
// `{ "type": "ready", "port": n }` line on stdout. The host is asked to shut
// down over HTTP and, failing that, its process tree is stopped by its own
// PID (process-tree.mjs) — never by name.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { stopTree, treeSpawnOptions } from '../process-tree.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..', '..')
const hostDll = path.join(repoRoot, 'app', 'Sprint.Desktop.Host', 'bin', 'Debug', 'net10.0', 'Sprint.Desktop.Host.dll')
const output = path.join(here, 'state.local.json')
const dotnet = process.argv[2] ?? 'dotnet'

if (!existsSync(hostDll)) {
  console.error(`Host not built: ${hostDll}\nRun: dotnet build app/Sprint.Desktop.Host/Sprint.Desktop.Host.csproj -nodeReuse:false`)
  process.exit(1)
}

const token = randomBytes(32).toString('hex')
const child = spawn(dotnet, [hostDll], {
  ...treeSpawnOptions,
  cwd: path.dirname(hostDll),
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, SPRINT_DESKTOP_TOKEN: token },
})
console.log(`host pid ${child.pid}`)

/** Resolves the host's loopback port from its readiness line. */
const ready = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Host did not become ready within 30 seconds.')), 30_000)
  child.once('exit', (code) => reject(new Error(`Host exited before readiness (${code}).`)))
  createInterface({ input: child.stdout }).on('line', (line) => {
    if (!line.startsWith('{')) return
    try {
      const message = JSON.parse(line)
      if (message.type === 'ready' && Number.isInteger(message.port)) {
        clearTimeout(timeout)
        resolve(message.port)
      }
    } catch {
      // Not the readiness record.
    }
  })
})

const exited = new Promise((resolve) => child.once('exit', resolve))

/** Asks the host to exit, then stops its process tree by PID if it is still alive after 5s. */
async function stop(port) {
  if (port !== undefined) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(2000),
      })
    } catch {
      // Fall through to the PID kill below.
    }
  }
  const timedOut = await Promise.race([exited.then(() => false), new Promise((resolve) => setTimeout(() => resolve(true), 5000))])
  if (timedOut) await stopTree(child)
  console.log(`host pid ${child.pid} exited`)
}

// On macOS/Linux the host runs in its own process group, so the terminal's
// Ctrl+C no longer reaches it; stop it here instead.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, async () => {
    await stopTree(child)
    process.exit(1)
  })
}

let port
try {
  port = await ready
  // Give telemetry sources and devices a moment to report a settled state.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const response = await fetch(`http://127.0.0.1:${port}/api/state`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`/api/state returned ${response.status}`)
  const state = await response.json()
  writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`)
  console.log(`wrote ${output}`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await stop(port)
}
