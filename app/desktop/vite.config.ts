import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react()],
  define: { __SPRINT_DEV_BRANCH__: JSON.stringify(command === 'serve' ? devBranch() : null) },
}))
