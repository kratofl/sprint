#!/usr/bin/env node
// Screenshots dist/preview.html in headless Edge (build it first with
// build-preview.mjs). Edge runs under PowerShell's Start-Process -Wait, which
// waits for the whole Edge process tree: msedge.exe hands the work to a second
// process and exits early, so waiting on it directly returns before the PNG is
// written. That PowerShell host is tracked by PID and its tree is killed by that
// PID if it has not finished after 60s — never by name.
//
//   node scripts/preview/screenshot.mjs --out C:\path\shot.png [--view Devices] [--theme dark]
//        [--size 1440,900] [--query collapsed=1&palette=1] [--dist dist-views-a]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(here, '..', '..')
// --dist <name> picks the build folder (default dist). Parallel agents each use their own,
// e.g. --dist dist-views-a, so their builds never overwrite each other. Only dist or dist-<slug>
// is accepted: both are gitignored and stay inside app/desktop.
function distFolder(argv) {
  const index = argv.indexOf('--dist')
  const name = index >= 0 && argv[index + 1] ? argv[index + 1] : 'dist'
  if (!/^dist(-[a-z0-9-]+)?$/.test(name)) {
    console.error('--dist must be "dist" or "dist-<lowercase-slug>"')
    process.exit(1)
  }
  return name
}
const dist = path.join(desktopRoot, distFolder(process.argv))
const preview = path.join(dist, 'preview.html')
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
// A fresh throwaway profile per run, inside dist/ (gitignored), so the user's own
// Edge profile is never touched. Reusing one profile made later headless runs
// exit without writing a screenshot. Edge also gets forward-slash paths: with
// backslashes it sometimes exits the same way.
const profileDir = path.join(dist, `edge-profile-${process.pid}`)
const forEdge = (filePath) => filePath.replaceAll(path.sep, '/')

/** Reads `--name value` pairs from the command line. */
function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const out = option('out')
if (!out || !path.isAbsolute(out)) {
  console.error('--out <absolute .png path> is required')
  process.exit(1)
}
if (!existsSync(preview)) {
  console.error(`Missing ${preview}; run node scripts/preview/build-preview.mjs first.`)
  process.exit(1)
}
mkdirSync(path.dirname(out), { recursive: true })
rmSync(out, { force: true })

const query = new URLSearchParams(option('query', ''))
query.set('view', option('view', 'Home'))
const theme = option('theme')
if (theme) query.set('theme', theme)
const url = `${pathToFileURL(preview).href}?${query.toString()}`

const edgeArgs = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--no-first-run',
  `--user-data-dir=${forEdge(profileDir)}`,
  `--window-size=${option('size', '1440,900')}`,
  // Lets the async state load and the view switch settle before the capture.
  '--virtual-time-budget=4000',
  `--screenshot=${forEdge(out)}`,
  url,
]
// Single-quoted PowerShell literals: only an embedded ' needs escaping.
const psLiteral = (value) => `'${value.replaceAll("'", "''")}'`
const command = `Start-Process -FilePath ${psLiteral(edge)} -ArgumentList @(${edgeArgs.map(psLiteral).join(',')}) -Wait`
const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'ignore', windowsHide: true })

const exited = new Promise((resolve) => child.once('exit', resolve))
let timer
const timedOut = await Promise.race([exited.then(() => false), new Promise((resolve) => (timer = setTimeout(() => resolve(true), 60_000)))])
clearTimeout(timer)
if (timedOut && child.pid !== undefined) {
  spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
  await exited
}
// The profile path is built above from dist/ and this process id, never from input.
rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })

if (timedOut) {
  console.error('Edge did not exit within 60s and was stopped.')
  process.exit(1)
}
if (!existsSync(out)) {
  console.error(`Edge exited without writing ${out}`)
  process.exit(1)
}
console.log(`wrote ${out}`)
