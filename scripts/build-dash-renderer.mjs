#!/usr/bin/env node
// Builds the Rust wheel-dash renderer (packages/dashboard/renderer) and copies the result where a
// consumer needs it.
//
//   node scripts/build-dash-renderer.mjs --rid <rid> --out <dir>   native library, release build
//   node scripts/build-dash-renderer.mjs --wasm [--out <dir>]      WebAssembly build, release
//   node scripts/build-dash-renderer.mjs --cargo <args...>         any cargo command in the crate (make test-app, lint-app, fmt)
//
// --rid is a .NET runtime identifier: the host's build passes the architecture its output runs as
// (app/Sprint.Desktop.Host/Sprint.Desktop.Host.csproj). --wasm writes sprint_dash.wasm into
// packages/dashboard/generated (gitignored) unless --out says otherwise: the dashboard package
// loads it from there (src/DashCanvas.tsx), and the desktop app's Vite config runs this before
// every dev server and build. Needs the Rust toolchain (cargo, and the rustup target for that
// architecture); it never installs anything itself.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const crateDir = path.join(repoRoot, 'packages', 'dashboard', 'renderer')
// Where the dashboard package loads the WebAssembly build from.
const wasmDir = path.join(repoRoot, 'packages', 'dashboard', 'generated')
const wasmTarget = 'wasm32-unknown-unknown'
const wasmFile = 'sprint_dash.wasm'

// .NET runtime identifier -> Rust target and the library file cargo produces for it.
const targets = {
  'win-x64': { target: 'x86_64-pc-windows-msvc', file: 'sprint_dash.dll' },
  'win-x86': { target: 'i686-pc-windows-msvc', file: 'sprint_dash.dll' },
  'osx-arm64': { target: 'aarch64-apple-darwin', file: 'libsprint_dash.dylib' },
  'osx-x64': { target: 'x86_64-apple-darwin', file: 'libsprint_dash.dylib' },
  'linux-x64': { target: 'x86_64-unknown-linux-gnu', file: 'libsprint_dash.so' },
}

// Every failure goes out with this prefix: the host's build turns such a line into its build error.
function fail(message) {
  console.error(`build-dash-renderer: error: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { rid: null, out: null, wasm: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--wasm') args.wasm = true
    else if (arg === '--rid') args.rid = argv[++i] ?? null
    else if (arg === '--out') args.out = argv[++i] ?? null
    else fail(`unknown argument ${arg}. Usage: build-dash-renderer.mjs --rid <rid> --out <dir> | --wasm [--out <dir>]`)
  }
  return args
}

// cargo on PATH, else the standard rustup location (installers add it to PATH only for new shells).
function findCargo() {
  const exe = process.platform === 'win32' ? 'cargo.exe' : 'cargo'
  const probe = spawnSync(exe, ['--version'], { stdio: 'ignore' })
  if (!probe.error && probe.status === 0) return exe
  const cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo')
  const fallback = path.join(cargoHome, 'bin', exe)
  if (existsSync(fallback)) return fallback
  fail('the Rust toolchain is required to build the wheel-dash renderer, but cargo was not found on PATH or in ~/.cargo/bin. Install it from https://rustup.rs, then build again.')
}

// Stops with the one command to run when the target's standard library is missing. Skipped when
// rustup itself is not there (a distribution's Rust): cargo then reports the problem itself.
function checkTargetInstalled(cargo, target) {
  const exe = process.platform === 'win32' ? 'rustup.exe' : 'rustup'
  const rustup = path.isAbsolute(cargo) ? path.join(path.dirname(cargo), exe) : exe
  const listed = spawnSync(rustup, ['target', 'list', '--installed'], { encoding: 'utf8' })
  if (listed.error || listed.status !== 0) return
  if (!listed.stdout.split(/\r?\n/).includes(target)) {
    fail(`the Rust target ${target} is not installed. Run: rustup target add ${target}`)
  }
}

// Same bytes already there: leave the file (and its timestamp) alone, so MSBuild's incremental
// copy has nothing to do.
function sameFile(a, b) {
  if (!existsSync(b)) return false
  if (statSync(a).size !== statSync(b).size) return false
  return readFileSync(a).equals(readFileSync(b))
}

// Copies through a temporary file and a rename, so two builds copying the same library at once
// never leave a half-written file behind for a process to load.
function copyAtomically(source, destination) {
  if (sameFile(source, destination)) return false
  mkdirSync(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.${process.pid}.tmp`
  try {
    copyFileSync(source, temporary)
    renameSync(temporary, destination)
  } catch (error) {
    rmSync(temporary, { force: true })
    // Another build won the race with an identical file; only a different file is an error.
    if (!sameFile(source, destination)) throw error
  }
  return true
}

// Release build of the library for one Rust target; returns the file cargo wrote.
function cargoBuild(target, file) {
  const cargo = findCargo()
  checkTargetInstalled(cargo, target)
  // An explicit --target keeps each architecture in its own target/<triple> folder. Cargo locks
  // that folder itself, so parallel builds wait for each other instead of sharing half a build.
  const build = spawnSync(
    cargo,
    ['build', '--release', '--lib', '--quiet', '--target', target, '--manifest-path', path.join(crateDir, 'Cargo.toml')],
    { stdio: 'inherit' },
  )
  if (build.error) fail(`could not run cargo: ${build.error.message}`)
  if (build.status !== 0) fail(`cargo build for ${target} failed (exit code ${build.status}); see its output above.`)
  const built = path.join(crateDir, 'target', target, 'release', file)
  if (!existsSync(built)) fail(`cargo reported success but ${built} does not exist.`)
  return built
}

function buildNative(rid, out) {
  const entry = targets[rid]
  if (!entry) fail(`no Rust target for the runtime identifier ${rid}; known: ${Object.keys(targets).join(', ')}`)
  const copied = copyAtomically(cargoBuild(entry.target, entry.file), path.join(out, entry.file))
  console.log(`build-dash-renderer: ${entry.file} for ${rid} ${copied ? 'copied to' : 'up to date in'} ${out}`)
}

// The WebAssembly build has no imports: the JS glue (packages/dashboard/src/dashWasm.js)
// instantiates it with an empty import object and drives the same C ABI the host P/Invokes.
function buildWasm(out) {
  const copied = copyAtomically(cargoBuild(wasmTarget, wasmFile), path.join(out, wasmFile))
  console.log(`build-dash-renderer: ${wasmFile} ${copied ? 'copied to' : 'up to date in'} ${out}`)
}

// Runs cargo in the crate with the given arguments and exits with its status.
function runCargo(cargoArgs) {
  const run = spawnSync(findCargo(), cargoArgs, { cwd: crateDir, stdio: 'inherit' })
  if (run.error) fail(`could not run cargo: ${run.error.message}`)
  process.exit(run.status ?? 1)
}

if (process.argv[2] === '--cargo') runCargo(process.argv.slice(3))
const args = parseArgs(process.argv.slice(2))
if (args.wasm) {
  buildWasm(path.resolve(args.out ?? wasmDir))
} else {
  if (!args.out) fail('--out <dir> is required')
  if (!args.rid) fail('--rid <rid> is required (win-x64, win-x86, osx-arm64, osx-x64, linux-x64)')
  buildNative(args.rid, path.resolve(args.out))
}
