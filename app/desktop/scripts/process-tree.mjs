// Stops a spawned child and everything it started, by the child's own PID --
// never by process name. Used by dev.mjs and the preview scripts, whose children
// spawn their own (Electron starts the dotnet host and its GPU/renderer helpers).
//
// Spawn the child with `treeSpawnOptions` so the POSIX path works: `detached`
// makes it the leader of a new process group whose id is its PID, and the whole
// group is signalled. A detached child runs in its own session, so it receives
// neither the terminal's Ctrl+C nor its hangup: the parent must handle SIGINT,
// SIGTERM and SIGHUP and call stopTree itself.
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

export const treeSpawnOptions = { detached: process.platform !== 'win32' }

/**
 * Stops `child`'s process tree and resolves once the child has exited.
 * Windows: `taskkill /pid <pid> /t /f`. POSIX: SIGTERM to the process group,
 * then SIGKILL to whatever is left after `graceMs`.
 */
export async function stopTree(child, graceMs = 3000) {
  if (child?.pid === undefined) return
  const running = child.exitCode === null && child.signalCode === null
  const exited = running ? new Promise((resolve) => child.once('exit', resolve)) : Promise.resolve()

  if (process.platform === 'win32') {
    // taskkill /t walks the tree from the live root, so it only helps while the child runs.
    if (running) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
    // A failed taskkill must not hang the caller's teardown.
    await Promise.race([exited, delay(graceMs)])
    return
  }

  // Signal the group even if the leader already exited: its children (e.g. the
  // host Electron started) can outlive it and still belong to the group. The
  // kernel never reuses a PID while a group with that id has members, so a live
  // process with the dead leader's PID means the group is gone and the PID now
  // belongs to someone else -- leave it alone.
  const pgid = child.pid
  if (!running && isAlive(pgid)) return
  if (signalGroup(pgid, 'SIGTERM')) {
    const deadline = Date.now() + graceMs
    while (signalGroup(pgid, 0) && Date.now() < deadline) await delay(100)
    signalGroup(pgid, 'SIGKILL')
  } else if (running) {
    // Not a group leader (spawned without treeSpawnOptions): stop at least the child.
    child.kill('SIGKILL')
  }
  await exited
}

/** True while some process has id `pid`. */
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: it exists but belongs to another user.
    return error?.code === 'EPERM'
  }
}

/** Sends `signal` to process group `pgid`; false once the group has no members left. */
function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal)
    return true
  } catch {
    return false
  }
}
