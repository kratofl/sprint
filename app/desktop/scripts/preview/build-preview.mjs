#!/usr/bin/env node
// Builds the renderer and writes dist/preview.html: dist/index.html plus the
// `window.sprint` stub (preview-stub.js) and a static state payload, so any
// view can be opened and screenshotted in a browser without Electron or the
// native host. See README.md next to this file.
//
//   node scripts/preview/build-preview.mjs              vite build, then write the preview
//   node scripts/preview/build-preview.mjs --skip-build  reuse the current dist/
//   node scripts/preview/build-preview.mjs --sample     use state.sample.json even if state.local.json exists
//   node scripts/preview/build-preview.mjs --dist dist-views-a   build into its own folder (parallel agents)
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
const args = new Set(process.argv.slice(2))

if (!args.has('--skip-build')) {
  const vite = path.join(desktopRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const build = spawnSync(process.execPath, [vite, 'build', '--outDir', dist, '--emptyOutDir'], { cwd: desktopRoot, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const indexPath = path.join(dist, 'index.html')
if (!existsSync(indexPath)) {
  console.error(`No renderer build at ${indexPath}; run without --skip-build.`)
  process.exit(1)
}

// A captured real payload (capture-state.mjs) beats the synthetic sample unless --sample is given.
const localState = path.join(here, 'state.local.json')
const statePath = !args.has('--sample') && existsSync(localState) ? localState : path.join(here, 'state.sample.json')
const state = readFileSync(statePath, 'utf8')
writeFileSync(path.join(dist, 'preview-state.js'), `window.__SPRINT_PREVIEW_STATE__ = ${state.trim()};\n`)
copyFileSync(path.join(here, 'preview-stub.js'), path.join(dist, 'preview-stub.js'))

// Classic scripts run before the deferred module bundle, so the stub is in place when bridge.ts loads.
const index = readFileSync(indexPath, 'utf8')
const moduleScript = index.indexOf('<script type="module"')
if (moduleScript < 0) {
  console.error(`${indexPath} has no module script to precede.`)
  process.exit(1)
}
const injected = '<script src="./preview-state.js"></script>\n    <script src="./preview-stub.js"></script>\n    '
writeFileSync(path.join(dist, 'preview.html'), index.slice(0, moduleScript) + injected + index.slice(moduleScript))
console.log(`preview: ${path.join(dist, 'preview.html')} (state: ${path.basename(statePath)})`)
