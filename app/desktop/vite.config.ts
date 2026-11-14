import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const buildDashRenderer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'build-dash-renderer.mjs')

// Every dash picture is drawn by the Rust renderer compiled to WebAssembly, which
// @sprint/dashboard loads from packages/dashboard/generated. Built before every dev server and
// build (cargo has nothing to do when the crate did not change), so the file is always there
// and current; a missing Rust toolchain stops the build with the script's own message.
function dashRendererWasm(): Plugin {
  return {
    name: 'sprint-dash-renderer-wasm',
    buildStart() {
      execFileSync(process.execPath, [buildDashRenderer, '--wasm'], { stdio: 'inherit' })
    },
  }
}

// The branch a dev run is built from, for the sidebar's build tag (src/shell/build.ts).
// Null in a packaged build, or when git cannot tell (detached HEAD reads "HEAD").
function devBranch(): string | null {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return branch && branch !== 'HEAD' ? branch : null
  } catch {
    return null
  }
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [dashRendererWasm(), react()],
  define: { __SPRINT_DEV_BRANCH__: JSON.stringify(command === 'serve' ? devBranch() : null) },
}))
