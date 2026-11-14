#!/usr/bin/env node
// Screenshots a design mockup's three options (src/mockups/<name>.tsx, see src/mockup/mockup.ts)
// in the preview harness, each where it lives -- its page inside the real app shell, or its
// window -- in light and dark, and writes a sheet comparing A, B and C side by side.
//
//   node scripts/preview/mockup.mjs <name> [--size 1440,900] [--themes dark,light]
//        [--query "platform=mac&click=..."] [--clip x,y,w,h] [--skip-build] [--dist dist-mockup]
//
// Writes app/desktop/.dev/mockups/<name>/<A|B|C>-<theme>.png (plus -detail.png with --clip, the
// part that differs at full size) and sheet.html (mockup-sheet.mjs) for T3's html_render.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mockupSheet } from './mockup-sheet.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(here, '..', '..')

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
if (!name || !/^[a-z0-9-]+$/.test(name)) fail('usage: mockup.mjs <name> (lowercase-slug, src/mockups/<name>.tsx)')
if (!existsSync(path.join(desktopRoot, 'src', 'mockups', `${name}.tsx`))) fail(`No src/mockups/${name}.tsx`)

const dist = option('dist', 'dist')
const size = option('size', '1440,900')
const themes = option('themes', 'dark,light').split(',')
if (themes.some((theme) => theme !== 'dark' && theme !== 'light')) fail('--themes takes dark and/or light')
const extraQuery = option('query', '')
const clip = option('clip')
if (clip && !/^\d+,\d+,\d+,\d+$/.test(clip)) fail('--clip must be x,y,width,height in pixels')

if (!process.argv.includes('--skip-build')) {
  const build = spawnSync(process.execPath, [path.join(here, 'build-preview.mjs'), '--dist', dist], { cwd: desktopRoot, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const outDir = path.join(desktopRoot, '.dev', 'mockups', name)
mkdirSync(outDir, { recursive: true })
const shot = (variant, theme, suffix = '') => path.join(outDir, `${variant}-${theme}${suffix}.png`)
const sheet = { A: [], B: [], C: [] }

for (const theme of themes) {
  for (const variant of Object.keys(sheet)) {
    const query = new URLSearchParams(extraQuery)
    query.set('mockup', name)
    query.set('variant', variant)
    const args = [path.join(here, 'screenshot.mjs'), '--dist', dist, '--size', size, '--theme', theme, '--query', query.toString(), '--out', shot(variant, theme)]
    if (clip) args.push('--clip', clip, '--clip-out', shot(variant, theme, '-detail'))
    const run = spawnSync(process.execPath, args, { cwd: desktopRoot, stdio: ['ignore', 'ignore', 'inherit'] })
    if (run.status !== 0) fail(`screenshot of ${variant} (${theme}) failed`)
    sheet[variant].push({ caption: theme, src: shot(variant, theme), detail: clip ? shot(variant, theme, '-detail') : undefined })
    console.log(`${variant} ${theme}: ${shot(variant, theme)}`)
  }
}

writeFileSync(path.join(outDir, 'sheet.html'), mockupSheet(sheet))
console.log(`sheet: ${path.join(outDir, 'sheet.html')}`)
