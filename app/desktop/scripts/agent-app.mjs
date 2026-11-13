#!/usr/bin/env node
// An agent's own run of the real desktop app: dev.mjs with every window hidden and a DevTools
// (CDP) port, on a fresh data folder, optionally a copy of existing data and a telemetry replay.
// Nothing shows on screen, nothing touches another run, and `cdp.mjs` drives and captures it.
//
//   node scripts/agent-app.mjs [--data <dir to copy>] [--replay <recording>]
//     starts a run in .dev/agent-runs/<id>, prints its folder and CDP port once the app is up,
//     and keeps running until stopped
//   node scripts/agent-app.mjs stop <run folder>
//     stops that run's whole process tree (by the PID it recorded) and deletes its folder
//
// Every concurrent run needs its own data folder: Electron keeps its browser profile there and
// Chromium locks it. The replay needs a Debug host, which a dev run is.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { recordingsRoot } from './dev-data.mjs'
import { stopTree, treeSpawnOptions } from './process-tree.mjs'

const desktopRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const runsRoot = path.join(desktopRoot, '.dev', 'agent-runs')
const STARTUP_TIMEOUT_MS = 180_000

/** The value after `--name`, or null. */
const option = (args, name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? null : null
}

const fail = (message) => {
  console.error(`[agent-app] ${message}`)
  process.exit(1)
}

/** A run folder given on the command line, checked to be one of ours before anything is deleted. */
function runFolder(given) {
  const folder = path.resolve(given ?? '')
  const relative = path.relative(runsRoot, folder)
  if (!given || !relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) {
    fail(`not an agent run folder: ${given ?? '(none)'} (runs live in ${runsRoot})`)
  }
  return folder
}

async function stop(given) {
  const folder = runFolder(given)
  const runFile = path.join(folder, 'run.json')
  if (existsSync(runFile)) {
    const { pid } = JSON.parse(readFileSync(runFile, 'utf8'))
    if (process.platform === 'win32') {
      // The run's own tree: this script's PID → dev.mjs → Vite, Electron → the host.
      await new Promise((resolve) => spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }).once('exit', resolve))
    } else {
      // Its SIGTERM handler stops its children's process groups, then it exits.
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // Already gone.
      }
    }
  }
  // The profile and host logs stay locked for a moment after the processes go.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(folder, { recursive: true, force: true })
      console.log(`[agent-app] stopped and removed ${folder}`)
      return
    } catch {
      await delay(250)
    }
  }
  fail(`stopped, but could not delete ${folder}; something still holds it open`)
}

function resolveRecording(file) {
  const candidates = [path.resolve(file), path.join(recordingsRoot, file)]
  const recording = candidates.find((candidate) => existsSync(candidate))
  if (!recording) {
    const known = existsSync(recordingsRoot) ? readdirSync(recordingsRoot).filter((name) => name.endsWith('.jsonl.gz')) : []
    fail(`no recording at ${file}${known.length > 0 ? `; known: ${known.join(', ')}` : '; make record-app makes them'}`)
  }
  return recording
}

async function start(args) {
  const source = option(args, '--data')
  const replay = option(args, '--replay')
  const recording = replay ? resolveRecording(replay) : null

  const id = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const folder = path.join(runsRoot, id)
  const dataRoot = path.join(folder, 'data')
  mkdirSync(dataRoot, { recursive: true })
  if (source) {
    if (!existsSync(source)) fail(`no data folder at ${source}`)
    cpSync(source, dataRoot, { recursive: true })
  }

  // ELECTRON_RUN_AS_NODE (set under Electron-based tools) would start Electron as plain Node.
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env
  const dev = spawn(process.execPath, [path.join(desktopRoot, 'scripts', 'dev.mjs')], {
    ...treeSpawnOptions,
    cwd: desktopRoot,
    // Vite and Electron logs go to a file, so a background run doesn't flood the caller.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...env,
      SPRINT_DESKTOP_HIDDEN: '1',
      SPRINT_DESKTOP_DATA_ROOT: dataRoot,
      ...(recording ? { SPRINT_TELEMETRY_REPLAY: recording } : {}),
    },
  })
  const log = path.join(folder, 'app.log')
  writeFileSync(log, '')
  const append = (chunk) => writeFileSync(log, chunk, { flag: 'a' })
  dev.stdout.on('data', append)
  dev.stderr.on('data', append)
  writeFileSync(path.join(folder, 'run.json'), JSON.stringify({ pid: process.pid, devPid: dev.pid, dataRoot, recording }, null, 2))

  const shutdown = async () => {
    await stopTree(dev)
    process.exit(0)
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => void shutdown())
  dev.once('exit', (code) => {
    console.log(`[agent-app] the app exited (${code ?? 'signal'}); log: ${log}`)
    process.exit(code ?? 1)
  })

  // Chromium writes the port it chose, then the browser's path, once DevTools listens. The main
  // window has loaded once a page target for it exists.
  const portFile = path.join(dataRoot, 'DevToolsActivePort')
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  let port = null
  while (Date.now() < deadline) {
    if (port === null && existsSync(portFile)) port = Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || null
    if (port !== null) {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json(), () => [])
      if (targets.some((target) => target.type === 'page' && target.url.includes('backdrop=window'))) break
    }
    await delay(250)
  }
  if (port === null || Date.now() >= deadline) {
    console.error(`[agent-app] the app did not come up in ${STARTUP_TIMEOUT_MS / 1000}s; log: ${log}`)
    await stopTree(dev)
    process.exit(1)
  }
  writeFileSync(path.join(folder, 'run.json'), JSON.stringify({ pid: process.pid, devPid: dev.pid, dataRoot, recording, cdpPort: port }, null, 2))
  console.log(`[agent-app] ready  run=${folder}  cdp=${port}${recording ? `  replay=${path.basename(recording)}` : ''}`)
  console.log(`[agent-app] drive: node scripts/cdp.mjs ${folder} <shot|click|type|key|eval|wait> …`)
  console.log(`[agent-app] stop:  node scripts/agent-app.mjs stop ${folder}`)
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'stop') await stop(rest[0])
else await start(process.argv.slice(2))
