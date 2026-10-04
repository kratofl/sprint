#!/usr/bin/env node
// Dev orchestration: compile the Electron main/preload sources, start Vite,
// then launch Electron pointed at the Vite dev server. Everything this script
// spawns is tracked by PID and torn down on exit -- never killed by name.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const desktopRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const nodeBin = process.execPath
const children = []
let cleaningUp = false

function killProcessTree(child) {
  if (!child || child.pid === undefined) return
  if (child.exitCode !== null || child.signalCode !== null) return
  // taskkill /t brings down the process's own children too (e.g. the dotnet
  // native host Electron spawns), so nothing this script started is orphaned.
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}

function cleanup() {
  if (cleaningUp) return
  cleaningUp = true
  for (const child of children) killProcessTree(child)
}

function runToCompletion(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeBin, [scriptPath, ...args], { cwd: desktopRoot, stdio: 'inherit' })
    children.push(child)
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${scriptPath} exited with code ${code}`))))
  })
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
    cwd: desktopRoot,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  children.push(vite)
  vite.stdout.pipe(process.stdout)
  const url = await waitForViteUrl(vite)

  const electron = spawn(electronPath, [path.join(desktopRoot, 'dist-electron', 'main.js')], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: { ...process.env, SPRINT_DESKTOP_DEV_SERVER_URL: url },
  })
  children.push(electron)

  const exitCode = await new Promise((resolve) => {
    electron.once('exit', (code) => resolve(code ?? 0))
    vite.once('exit', (code) => resolve(code ?? 1))
  })
  cleanup()
  process.exitCode = exitCode
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanup()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('[sprint] dev failed:', error)
  cleanup()
  process.exitCode = 1
})
