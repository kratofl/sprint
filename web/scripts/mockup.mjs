#!/usr/bin/env node
// Screenshots a web design mockup's three options (web/mockups/<name>.tsx, see lib/mockup.ts),
// each inside the real app shell, wide and at phone width, in light and dark, and writes a sheet
// comparing A, B and C side by side. Run from web/:
//
//   node scripts/mockup.mjs <name> [--server http://localhost:3000] [--sizes 1440,900+390,844]
//        [--themes dark,light]
//
// Without --server it starts its own `next dev` on port 3107 and stops it afterwards, by its PID.
// A dev server already running for this checkout can be reused with --server instead (Next allows
// one per project). Pictures are taken with the desktop's Electron screenshot
// (app/desktop/scripts/preview/screenshot.mjs --url); the page follows the OS colour scheme it
// sets, without Next's dev indicator. Writes web/mockups/shots/<name>/<A|B|C>-<theme>-<width>.png and sheet.html
// (app/desktop/scripts/preview/mockup-sheet.mjs) for T3's html_render.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { mockupSheet } from '../../app/desktop/scripts/preview/mockup-sheet.mjs'
import { stopTree, treeSpawnOptions } from '../../app/desktop/scripts/process-tree.mjs'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktopRoot = path.resolve(webRoot, '..', 'app', 'desktop')
const screenshot = path.join(desktopRoot, 'scripts', 'preview', 'screenshot.mjs')

/** Reads `--name value` pairs from the command line. */
function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const name = process.argv[2]
if (!name || !/^[a-z0-9-]+$/.test(name)) fail('usage: mockup.mjs <name> (lowercase-slug, web/mockups/<name>.tsx)')
if (!existsSync(path.join(webRoot, 'mockups', `${name}.tsx`))) fail(`No web/mockups/${name}.tsx`)
const themes = option('themes', 'dark,light').split(',')
if (themes.some((theme) => theme !== 'dark' && theme !== 'light')) fail('--themes takes dark and/or light')
const sizes = option('sizes', '1440,900+390,844').split('+')
if (sizes.some((size) => !/^\d+,\d+$/.test(size))) fail('--sizes takes width,height pairs joined by +')

const port = 3107
const server = option('server', `http://localhost:${port}`)
let devServer = null
if (!process.argv.includes('--server')) {
  const next = path.join(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
  devServer = spawn(process.execPath, [next, 'dev', '--port', String(port)], {
    ...treeSpawnOptions,
    cwd: webRoot,
    stdio: ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  })
  console.log(`next dev pid ${devServer.pid} on port ${port}`)
}

// The detached dev server would outlive an interrupted run; stop it with this script.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () => stopTree(devServer).finally(() => process.exit(1)))
}

const pageUrl = (variant) => `${server}/mockups/${name}?variant=${variant}`

try {
  // The first request compiles the page, which takes a while on a cold dev server.
  const deadline = Date.now() + 180_000
  for (;;) {
    if (devServer && devServer.exitCode !== null) throw new Error('next dev exited; is another dev server running for web/? Pass --server <its url>.')
    const status = await fetch(pageUrl('A')).then((response) => response.status, () => 0)
    if (status === 200) break
    if (Date.now() > deadline) throw new Error(`${pageUrl('A')} did not answer 200 within 180s (last status ${status})`)
    await delay(1000)
  }

  const outDir = path.join(webRoot, 'mockups', 'shots', name)
  mkdirSync(outDir, { recursive: true })
  const sheet = { A: [], B: [], C: [] }
  for (const size of sizes) {
    const width = size.split(',')[0]
    for (const theme of themes) {
      for (const variant of Object.keys(sheet)) {
        const out = path.join(outDir, `${variant}-${theme}-${width}.png`)
        const run = spawnSync(process.execPath, [screenshot, '--url', pageUrl(variant), '--theme', theme, '--size', size, '--hide', 'nextjs-portal', '--out', out], {
          cwd: desktopRoot,
          stdio: ['ignore', 'ignore', 'inherit'],
        })
        if (run.status !== 0) throw new Error(`screenshot of ${variant} (${theme}, ${size}) failed`)
        sheet[variant].push({ caption: `${theme} · ${width}px`, src: out })
        console.log(`${variant} ${theme} ${width}px: ${out}`)
      }
    }
  }
  writeFileSync(path.join(outDir, 'sheet.html'), mockupSheet(sheet))
  console.log(`sheet: ${path.join(outDir, 'sheet.html')}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await stopTree(devServer)
}
