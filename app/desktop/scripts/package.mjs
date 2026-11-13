// Packages the desktop app into app/build/bin with electron-builder.
//
//   node scripts/package.mjs [version]
//
// Windows gets the NSIS installer (sprint-<version>-setup.exe) plus the latest.yml and blockmap
// the in-app updater reads (electron/updates.ts); the unpacked app lands in win-unpacked/.
// Linux gets a tar.gz, macOS an unsigned Sprint.app (development only; neither updates itself).
// Nothing is published from here: the release workflow uploads the files.
//
// Expects `pnpm build` to have run (dist/ + dist-electron/) and the native host to have been
// published into resources/host by `make build-app`. Packaging a tree without those produces an
// app that launches to a blank window, so both are checked up front rather than failing later.

import { access, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, Platform } from 'electron-builder'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(appDir, '../build/bin')

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

const platform = { win32: Platform.WINDOWS, linux: Platform.LINUX, darwin: Platform.MAC }[process.platform]
if (!platform) {
  console.error(`Unsupported platform: ${process.platform}`)
  process.exit(1)
}

// The updater compares versions as semver, so a build from an untagged checkout ("dev") still
// needs one; 0.0.0 sorts below every release, so such a build always sees updates as newer.
const requested = process.argv[2] ?? ''
const version = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(requested) ? requested : '0.0.0-dev'

await rm(outDir, { recursive: true, force: true })

const built = await build({
  targets: platform.createTarget(),
  projectDir: appDir,
  publish: 'never',
  config: {
    appId: 'com.sprint.desktop',
    productName: 'Sprint',
    executableName: 'Sprint',
    extraMetadata: { version },
    directories: { output: outDir },
    // Vite bundles the renderer and tsc the main process; node_modules only adds main's
    // runtime dependencies (electron-updater).
    files: ['dist/**', 'dist-electron/**', 'package.json'],
    asar: true,
    // The published host is a native binary; asar would make it unexecutable.
    extraResources: [{ from: 'resources/host', to: 'host' }],
    // Nothing native to rebuild against Electron's headers.
    npmRebuild: false,
    win: { target: 'nsis', icon: 'resources/icon.ico' },
    // One click, per user, no admin prompt: installs to %LocalAppData%\Programs\Sprint.
    // Sprint's data lives elsewhere (%AppData%\Sprint) and survives an uninstall.
    nsis: {
      oneClick: true,
      perMachine: false,
      artifactName: 'sprint-${version}-setup.${ext}',
      shortcutName: 'Sprint',
    },
    linux: { target: 'tar.gz', icon: 'resources/icon.png', artifactName: 'sprint-${version}-linux-${arch}.${ext}' },
    // The .icns comes from scripts/icons/make-mac-icon.mjs.
    mac: { target: 'dir', icon: 'resources/icon.icns', identity: null },
    // Where the installed app looks for updates (written into its app-update.yml).
    publish: { provider: 'github', owner: 'kratofl', repo: 'sprint' },
  },
})

console.log(`Packaged ${version}:\n${built.map((file) => `  ${file}`).join('\n')}`)
