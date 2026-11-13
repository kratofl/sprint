#!/usr/bin/env node
// Screenshots dist/preview.html with Electron (build it first with
// build-preview.mjs), on Windows and macOS alike. screenshot-electron.mjs loads
// the page in a hidden offscreen window at --size with a device scale factor of
// 1, so the PNG is exactly that many pixels. Electron gets a throwaway profile
// inside the dist folder, and its process tree is stopped by its own PID if it
// has not finished after 60s (process-tree.mjs) -- never by name.
//
//   node scripts/preview/screenshot.mjs --out /abs/path/shot.png [--view Devices] [--theme dark]
//        [--size 1440,900] [--query collapsed=1&palette=1] [--dist dist-views-a]
//        [--clip x,y,w,h --clip-out /abs/path/detail.png]   also writes that part of the picture
//   node scripts/preview/screenshot.mjs --url http://localhost:3107/mockups/x --out ... [--theme] [--size]
//        any page instead of the preview (the web's mockups, web/scripts/mockup.mjs); --theme then
//        only sets the OS colour scheme, which the page follows; --hide <css selector> hides
//        what is not part of the page, e.g. Next's dev indicator
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import electronPath from 'electron'
import { stopTree, treeSpawnOptions } from '../process-tree.mjs'

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
// A fresh throwaway profile per run, inside dist/ (gitignored), so the user's own
// Electron profile is never touched and parallel runs never share one.
const profileDir = path.join(dist, `electron-profile-${process.pid}`)

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
const pageUrl = option('url')
if (!pageUrl && !existsSync(preview)) {
  console.error(`Missing ${preview}; run node scripts/preview/build-preview.mjs first.`)
  process.exit(1)
}
mkdirSync(path.dirname(out), { recursive: true })
rmSync(out, { force: true })

const theme = option('theme')
if (theme && theme !== 'dark' && theme !== 'light') {
  console.error('--theme must be dark or light')
  process.exit(1)
}
const query = new URLSearchParams(option('query', ''))
query.set('view', option('view', 'Home'))
if (theme) query.set('theme', theme)
const url = pageUrl ?? `${pathToFileURL(preview).href}?${query.toString()}`

const size = option('size', '1440,900')
const [width, height] = size.split(',').map(Number)
if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
  console.error('--size must be <width>,<height> in pixels, e.g. 1440,900')
  process.exit(1)
}

const clipOption = option('clip')
const clipOut = option('clip-out')
let clip = null
if (clipOption) {
  const [x, y, clipWidth, clipHeight] = clipOption.split(',').map(Number)
  if (![x, y, clipWidth, clipHeight].every(Number.isInteger) || clipWidth < 1 || clipHeight < 1 || !clipOut || !path.isAbsolute(clipOut)) {
    console.error('--clip takes x,y,width,height in pixels and needs --clip-out <absolute .png path>')
    process.exit(1)
  }
  clip = { x, y, width: clipWidth, height: clipHeight, out: clipOut }
}

const job = { url, out, width, height, userData: profileDir, settleMs: 4000, clip, theme: theme ?? null, hide: option('hide') ?? null }
// ELECTRON_RUN_AS_NODE (set when this runs under an Electron-based tool) would make
// Electron start as plain Node and fail on `import { app } from 'electron'`.
const { ELECTRON_RUN_AS_NODE, ...env } = process.env
const child = spawn(electronPath, [path.join(here, 'screenshot-electron.mjs')], {
  ...treeSpawnOptions,
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: true,
  env: { ...env, SPRINT_SCREENSHOT: JSON.stringify(job) },
})
console.log(`electron pid ${child.pid}`)

const exited = new Promise((resolve) => child.once('exit', resolve))
let timer
const timedOut = await Promise.race([exited.then(() => false), new Promise((resolve) => (timer = setTimeout(() => resolve(true), 60_000)))])
clearTimeout(timer)
// Also sweeps any helper left behind after a normal exit; a no-op otherwise.
await stopTree(child)
// The profile path is built above from dist/ and this process id, never from input.
rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })

if (timedOut) {
  console.error('Electron did not exit within 60s and was stopped.')
  process.exit(1)
}
if (!existsSync(out)) {
  console.error(`Electron exited without writing ${out}`)
  process.exit(1)
}
console.log(`wrote ${out}`)
