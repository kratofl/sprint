#!/usr/bin/env node
// Cross-platform helpers for the Makefile, so each make target has one recipe
// that runs the same under PowerShell (Windows) and sh (macOS/Linux).
//
//   node scripts/make-tasks.mjs help              list `target: ## text` lines from the Makefile
//   node scripts/make-tasks.mjs version           latest git tag without its leading "v", or "dev"
//   node scripts/make-tasks.mjs rid               default .NET runtime identifier for this machine
//   node scripts/make-tasks.mjs clean [--dry-run] delete the fixed list of build outputs below
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Build outputs `make clean` removes. Fixed and repo-relative on purpose: nothing
// here is computed from input, and each entry is still checked to resolve inside
// the repo before it is deleted.
const cleanPaths = [
  'web/.next',
  'app/build/bin',
  'api/build/bin',
  'app/Sprint.Desktop.Core/bin',
  'app/Sprint.Desktop.Core/obj',
  'app/Sprint.Desktop.Host/bin',
  'app/Sprint.Desktop.Host/obj',
  'app/desktop/dist',
  'app/desktop/dist-electron',
  'app/desktop/resources/host',
  'app/Sprint.Desktop.Api/bin',
  'app/Sprint.Desktop.Api/obj',
  'app/Sprint.Contracts/bin',
  'app/Sprint.Contracts/obj',
  'app/Sprint.Games/bin',
  'app/Sprint.Games/obj',
  'app/Sprint.Desktop.Tests/bin',
  'app/Sprint.Desktop.Tests/obj',
  'api/Sprint.Api/bin',
  'api/Sprint.Api/obj',
  'api/Sprint.Api.Tests/bin',
  'api/Sprint.Api.Tests/obj',
]

function help() {
  const makefile = readFileSync(path.join(repoRoot, 'Makefile'), 'utf8')
  const lines = []
  for (const line of makefile.split(/\r?\n/)) {
    const match = /^([a-zA-Z_-]+):.*?## (.*)$/.exec(line)
    if (match) lines.push(`  ${match[1].padEnd(18)} ${match[2]}`)
  }
  console.log(lines.sort().join('\n'))
}

function version() {
  let tag = 'dev'
  try {
    tag = execFileSync('git', ['describe', '--tags', '--abbrev=0'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    // No tag (or no git): keep "dev".
  }
  console.log(tag.replace(/^v/, ''))
}

// process.arch reports the arch Node runs as; an x64 Node under Rosetta on an
// Apple Silicon Mac yields osx-x64. Pass RID= explicitly in that case.
function rid() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const os = { win32: 'win', darwin: 'osx', linux: 'linux' }[process.platform]
  if (!os) {
    console.error(`No default RID for ${process.platform}; pass RID=<rid>.`)
    process.exit(1)
  }
  // Windows stays win-x64 regardless of arch: that is the shipped target.
  console.log(os === 'win' ? 'win-x64' : `${os}-${arch}`)
}

function clean(dryRun) {
  for (const relative of cleanPaths) {
    const target = path.resolve(repoRoot, relative)
    const inside = path.relative(repoRoot, target)
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) {
      console.error(`Refusing to delete ${target}: not inside ${repoRoot}`)
      process.exit(1)
    }
    if (!existsSync(target)) continue
    if (dryRun) {
      console.log(`would remove ${relative}`)
      continue
    }
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    console.log(`removed ${relative}`)
  }
}

const [command, ...rest] = process.argv.slice(2)
switch (command) {
  case 'help':
    help()
    break
  case 'version':
    version()
    break
  case 'rid':
    rid()
    break
  case 'clean':
    clean(rest.includes('--dry-run'))
    break
  default:
    console.error('usage: node scripts/make-tasks.mjs help|version|rid|clean [--dry-run]')
    process.exit(1)
}
