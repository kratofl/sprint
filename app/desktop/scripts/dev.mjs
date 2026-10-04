#!/usr/bin/env node
// Dev orchestration: compile the Electron main/preload sources, start Vite,
// then launch Electron pointed at the Vite dev server. Everything this script
// spawns is tracked by PID and torn down on exit, together with its own
// children (e.g. the dotnet native host Electron starts) -- never killed by name.
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { stopTree, treeSpawnOptions } from './process-tree.mjs'

const desktopRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const nodeBin = process.execPath
const children = []
let cleanup

/** Stops every child's process tree; repeat calls share the first run. */
function stopChildren() {
  cleanup ??= Promise.all(children.map((child) => stopTree(child)))
  return cleanup
}

// stdin is ignored: on macOS/Linux the children run in their own process group,
// and a background group that touches the terminal's stdin is stopped (SIGTTIN).
const childStdio = ['ignore', 'inherit', 'inherit']

function runToCompletion(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeBin, [scriptPath, ...args], { ...treeSpawnOptions, cwd: desktopRoot, stdio: childStdio })
    children.push(child)
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${scriptPath} exited with code ${code}`))))
  })
}

/**
 * macOS labels the Dock tile with the name in the bundle Electron runs from, which
 * app.setName() cannot change; the stock bundle would show "Electron". Dev runs
 * therefore launch from .dev/Sprint.app: an APFS clone of the installed Electron.app
 * with a patched Info.plist and the Sprint icon, rebuilt when the Electron version
 * or icon.icns changes. The executable keeps its name `Electron`, which is what keeps
 * app.isPackaged false (dev behaviour, no updater). Returns the executable to spawn.
 */
function macDevBundle() {
  const stockApp = path.resolve(electronPath, '..', '..', '..')
  const devDir = path.join(desktopRoot, '.dev')
  const devApp = path.join(devDir, 'Sprint.app')
  const stampPath = path.join(devDir, 'Sprint.app.stamp')
  const icon = path.join(desktopRoot, 'resources', 'icon.icns')
  const plist = (app) => path.join(app, 'Contents', 'Info.plist')
  const electronVersion = execFileSync('plutil', ['-extract', 'CFBundleVersion', 'raw', '-o', '-', plist(stockApp)], { encoding: 'utf8' }).trim()
  const iconHash = createHash('sha256').update(readFileSync(icon)).digest('hex')
  const stamp = `electron ${electronVersion}\nicon ${iconHash}\n`
  const executable = path.join(devApp, 'Contents', 'MacOS', path.basename(electronPath))
  if (existsSync(executable) && existsSync(stampPath) && readFileSync(stampPath, 'utf8') === stamp) return executable

  rmSync(devApp, { recursive: true, force: true })
  rmSync(stampPath, { force: true })
  mkdirSync(devDir, { recursive: true })
  // -c clones on APFS: no extra disk until a file changes.
  execFileSync('cp', ['-cR', stockApp, devApp])
  cpSync(icon, path.join(devApp, 'Contents', 'Resources', 'Sprint.icns'))
  for (const [key, value] of [
    ['CFBundleName', 'Sprint'],
    ['CFBundleDisplayName', 'Sprint'],
    ['CFBundleIdentifier', 'com.sprint.desktop.dev'],
    ['CFBundleIconFile', 'Sprint.icns'],
  ]) {
    execFileSync('plutil', ['-replace', key, '-string', value, plist(devApp)])
  }
  // Written last, so an interrupted build is redone on the next run.
  writeFileSync(stampPath, stamp)
  return executable
}

/** The Electron executable to launch: the renamed dev bundle on macOS, else the npm one. */
function electronExecutable() {
  if (process.platform !== 'darwin') return electronPath
  try {
    return macDevBundle()
  } catch (error) {
    console.warn('[sprint] could not prepare the Sprint dev bundle; the Dock will show "Electron".', error)
    return electronPath
  }
}

const stripAnsi = (text) => text.replace(/\x1B\[[0-9;]*m/g, '')

function waitForViteUrl(vite) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const onData = (chunk) => {
      buffer += chunk.toString()
      const match = stripAnsi(buffer).match(/Local:\s+(http:\/\/\S+)/)
      if (match) {
        vite.stdout.off('data', onData)
        resolve(match[1])
      }
    }
    vite.stdout.on('data', onData)
    vite.once('exit', (code) => reject(new Error(`Vite exited before reporting a URL (${code}).`)))
    vite.once('error', reject)
  })
}

async function main() {
  await runToCompletion(path.join(desktopRoot, 'node_modules', 'typescript', 'bin', 'tsc'), ['-p', 'electron/tsconfig.json'])

  const vite = spawn(nodeBin, [path.join(desktopRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1'], {
    ...treeSpawnOptions,
    cwd: desktopRoot,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  children.push(vite)
  vite.stdout.pipe(process.stdout)
  const url = await waitForViteUrl(vite)
  // Ctrl+C while Vite was starting: teardown already ran, so do not start Electron.
  if (cleanup) return

  // ELECTRON_RUN_AS_NODE (set when this runs under an Electron-based tool) would make
  // Electron start as plain Node instead of the app.
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env
  const electron = spawn(electronExecutable(), [path.join(desktopRoot, 'dist-electron', 'main.js')], {
    ...treeSpawnOptions,
    cwd: desktopRoot,
    stdio: childStdio,
    env: { ...env, SPRINT_DESKTOP_DEV_SERVER_URL: url },
  })
  children.push(electron)

  const exitCode = await new Promise((resolve) => {
    electron.once('exit', (code) => resolve(code ?? 0))
    vite.once('exit', (code) => resolve(code ?? 1))
  })
  await stopChildren()
  process.exitCode = exitCode
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, async () => {
    await stopChildren()
    process.exit(0)
  })
}

main().catch(async (error) => {
  console.error('[sprint] dev failed:', error)
  await stopChildren()
  process.exitCode = 1
})
