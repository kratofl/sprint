// Packages the desktop app into app/build/bin.
//
// Expects `pnpm build` to have run (dist/ + dist-electron/) and the native host
// to have been published into resources/host by `make build-app`. Packaging a
// tree without those produces an app that launches to a blank window, so both
// are checked up front rather than failing later at runtime.

import { access, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packager } from '@electron/packager'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(appDir, '../build/bin')

const platforms = { win32: 'win32', linux: 'linux', darwin: 'darwin' }

const exists = async (path) => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const required = [
  [join(appDir, 'dist', 'index.html'), 'Renderer bundle missing. Run `pnpm --filter @sprint/desktop build` first.'],
  [join(appDir, 'dist-electron', 'main.js'), 'Electron main bundle missing. Run `pnpm --filter @sprint/desktop build` first.'],
  [join(appDir, 'resources', 'host'), 'Native host missing from resources/host. Run `make build-app`, which publishes it.'],
]

for (const [path, message] of required) {
  if (!(await exists(path))) {
    console.error(message)
    process.exit(1)
  }
}

const platform = platforms[process.platform]
if (!platform) {
  console.error(`Unsupported platform: ${process.platform}`)
  process.exit(1)
}

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

const [built] = await packager({
  dir: appDir,
  out: outDir,
  platform,
  arch: process.arch === 'arm64' ? 'arm64' : 'x64',
  name: 'Sprint',
  executableName: 'Sprint',
  appBundleId: 'com.sprint.desktop',
  // Packager appends the platform extension (.ico on Windows, .icns on macOS).
  icon: join(appDir, 'resources', 'icon'),
  overwrite: true,
  prune: true,
  asar: true,
  // The published host is a native binary; asar would make it unexecutable.
  extraResource: [join(appDir, 'resources', 'host')],
  ignore: [/^\/src($|\/)/, /^\/electron($|\/)/, /^\/scripts($|\/)/, /^\/resources\/host($|\/)/, /\.ts$/, /tsconfig.*\.json$/, /vite\.config\./],
})

console.log(`Packaged to ${built}`)
