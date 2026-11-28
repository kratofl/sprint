// Copies sessions driven in a dev run (this checkout's dev data, dev-data.mjs) into the installed
// app's lap history, so a session driven on a dev build is in Sprint proper too. `make
// dev-sessions-to-app` runs it:
//
//   (no SESSION)              lists the dev sessions the installed app does not have yet; copies nothing
//   SESSION=<id>[,<id>…]      copies those sessions (an id's first characters are enough)
//   SESSION=today             copies every session started today that the app does not have
//
// A session is its lap-history file and its laps' traces. Nothing in the installed app is ever
// overwritten: a session it already has is skipped. It refuses while the installed Sprint runs,
// which holds its corpus in memory. A recorded session the copy brings in is one the app's results
// import then skips (LapHistoryImportService.MatchesRecordedSession), so nothing doubles up.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { devDataRoot } from './dev-data.mjs'

/** The installed app's data folder: what the host uses without SPRINT_DESKTOP_DATA_ROOT (.NET's ApplicationData). */
function appDataRoot() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Sprint')
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'Sprint')
}

/** Whether the installed Sprint is running (the dev build's window is Electron's, not Sprint.exe). */
function appRunning() {
  try {
    if (process.platform === 'win32') return execFileSync('tasklist', ['/FI', 'IMAGENAME eq Sprint.exe', '/NH'], { encoding: 'utf8' }).includes('Sprint.exe')
    execFileSync('pgrep', ['-x', 'Sprint'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** The dev run's sessions, newest first: id, what and when, and how many laps. */
function devSessions() {
  const dir = path.join(devDataRoot, 'lap-history')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        const session = JSON.parse(readFileSync(path.join(dir, file), 'utf8'))
        return typeof session.id === 'string' ? [session] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
}

const describe = (session) => {
  const context = session.context ?? {}
  const when = session.startedAt ? new Date(session.startedAt).toLocaleString() : 'unknown time'
  return `${session.id}  ${when}  ${session.kind ?? 'Session'} · ${context.carModel ?? '?'} · ${context.trackCourse ?? '?'} · ${(session.laps ?? []).length} laps`
}

const sessionsArg = process.argv.slice(2).find((arg) => arg.startsWith('--session='))?.slice('--session='.length) ?? ''
const appRoot = appDataRoot()
const appHistory = path.join(appRoot, 'lap-history')
const appTraces = path.join(appRoot, 'lap-traces')
const inApp = (session) => existsSync(path.join(appHistory, `${session.id}.json`))
const sessions = devSessions()
const missing = sessions.filter((session) => !inApp(session))

if (!existsSync(appRoot)) {
  console.error(`No installed Sprint data at ${appRoot}. Start Sprint once, then try again.`)
  process.exit(1)
}

if (sessionsArg === '') {
  if (missing.length === 0) {
    console.log(`Every dev session is already in Sprint (${appRoot}).`)
  } else {
    console.log(`Dev sessions Sprint does not have yet (${devDataRoot}):\n`)
    for (const session of missing) console.log(`  ${describe(session)}`)
    console.log('\nCopy some:  make dev-sessions-to-app SESSION=<id>[,<id>]   (or SESSION=today)')
  }
  process.exit(0)
}

const today = new Date().toDateString()
const wanted =
  sessionsArg === 'today'
    ? missing.filter((session) => session.startedAt && new Date(session.startedAt).toDateString() === today)
    : sessionsArg.split(',').map((id) => id.trim()).filter(Boolean).flatMap((id) => {
        const matches = sessions.filter((session) => session.id.startsWith(id))
        if (matches.length !== 1) {
          console.error(matches.length === 0 ? `No dev session ${id}.` : `${id} names ${matches.length} sessions; give more of the id.`)
          process.exit(1)
        }
        return matches
      })

if (wanted.length === 0) {
  console.log('Nothing to copy.')
  process.exit(0)
}
if (appRunning()) {
  console.error('Sprint is running. Close it first: it holds its laps in memory and would not see the copy.')
  process.exit(1)
}

mkdirSync(appHistory, { recursive: true })
mkdirSync(appTraces, { recursive: true })
const devTraces = path.join(devDataRoot, 'lap-traces')
for (const session of wanted) {
  if (inApp(session)) {
    console.log(`  skipped  ${describe(session)} (already in Sprint)`)
    continue
  }
  // Traces first: a session file without its traces would show laps whose lines are missing.
  const traces = existsSync(devTraces) ? readdirSync(devTraces).filter((file) => file.startsWith(`${session.id}-`) && file.endsWith('.trace')) : []
  for (const file of traces) {
    const target = path.join(appTraces, file)
    if (!existsSync(target)) copyFileSync(path.join(devTraces, file), target)
  }
  copyFileSync(path.join(devDataRoot, 'lap-history', `${session.id}.json`), path.join(appHistory, `${session.id}.json`))
  console.log(`  copied   ${describe(session)}, ${traces.length} lap traces`)
}
console.log(`\nInto ${appRoot}. Start Sprint to see them in Analysis.`)
