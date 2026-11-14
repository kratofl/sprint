#!/usr/bin/env node
// Smoke test of the real desktop app: Electron, preload, bridge and the .NET host together,
// which no unit test and not the preview harness (a stubbed window.sprint) reach.
//
//   node scripts/smoke.mjs [--shots <dir>]
//
// Starts an agent run (scripts/agent-app.mjs) hidden, on fresh data, replaying a short real race
// (test-fixtures/replay-race.jsonl.gz), then:
//   1. finishes first run through window.sprint (a command round trip: preload → Electron → host)
//      and checks the host's state says so;
//   2. checks the replay reaches the app as live telemetry;
//   3. opens every page in the sidebar and checks it rendered something;
// and fails on any uncaught exception or console error along the way. Exits non-zero on failure
// and always stops the run. `--shots` saves a screenshot per page (CI keeps them on failure).
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const desktopRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fixture = path.join(desktopRoot, 'test-fixtures', 'replay-race.jsonl.gz')
const shotsIndex = process.argv.indexOf('--shots')
const shotsDir = shotsIndex >= 0 ? path.resolve(process.argv[shotsIndex + 1] ?? 'smoke-shots') : null
const NAV_ITEM = 'nav.navview button.nav-item:not(.nav-telemetry)'

const failures = []
const fail = (message) => failures.push(message)

/** Starts the agent run and resolves its folder and CDP port once it reports ready. */
function startRun() {
  const child = spawn(process.execPath, [path.join(desktopRoot, 'scripts', 'agent-app.mjs'), '--replay', fixture], {
    cwd: desktopRoot,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return new Promise((resolve, reject) => {
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
      const ready = output.match(/ready\s+run=(\S+)\s+cdp=(\d+)/)
      if (ready) resolve({ child, folder: ready[1], port: Number(ready[2]) })
    })
    child.once('exit', (code) => reject(new Error(`the agent run exited (${code}) before it was ready`)))
  })
}

function stopRun(folder) {
  return new Promise((resolve) => {
    spawn(process.execPath, [path.join(desktopRoot, 'scripts', 'agent-app.mjs'), 'stop', folder], { cwd: desktopRoot, stdio: 'inherit' }).once('exit', resolve)
  })
}

/** Polls `expression` in the page until it is truthy; false after `timeoutMs`. */
async function until(page, expression, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await page.evaluate(expression)) return true
    await delay(150)
  }
  return false
}

/**
 * Closes whatever modal dialog is open, through Escape as a user would. The startup scan offers
 * to import the game's archived sessions when it finds a results folder: on a developer's PC,
 * not in CI. Fails when a dialog will not close, since it would block every click after it.
 */
async function closeDialogs(page) {
  const open = `document.querySelector('[role="alertdialog"], [role="dialog"][aria-modal="true"]') !== null`
  for (let attempt = 0; attempt < 3 && (await page.evaluate(open)); attempt += 1) {
    await page.press('Escape')
    await delay(300)
  }
  if (await page.evaluate(open)) fail('a dialog stays open and blocks the app')
}

async function shot(page, name) {
  if (!shotsDir) return
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(shotsDir, `${name}.png`), Buffer.from(data, 'base64'))
}

async function check(page, errors) {
  // 1. First run, through the same window.sprint the views use.
  await page.evaluate(`window.sprint.sendCommand({ type: 'firstRun.complete', driverName: 'Smoke Test' })`)
  const state = await page.evaluate(`window.sprint.getState()`)
  if (state?.firstRun?.done !== true) fail('firstRun.complete did not reach the host state')
  if (!(await until(page, `document.querySelectorAll(${JSON.stringify(NAV_ITEM)}).length > 0`))) {
    fail('the app shell (sidebar) never appeared after first run')
    return
  }

  // 2. The replay arrives as live telemetry.
  const live = await until(page, `window.sprint.getState().then((s) => JSON.stringify(s.telemetry ?? {}).includes('Replay'))`, 15_000)
  if (!live) fail('the replayed race never showed up as the telemetry source')

  // Errors so far came from startup and first run, before any page was opened.
  for (const error of errors) fail(`startup: ${error}`)

  // 3. Every page in the sidebar renders.
  const labels = await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(NAV_ITEM)})].map((el) => el.textContent.trim())`)
  for (const [index, label] of labels.entries()) {
    const before = errors.length
    await closeDialogs(page)
    await page.click(NAV_ITEM, index)
    const shown = await until(
      page,
      `(() => { const item = document.querySelectorAll(${JSON.stringify(NAV_ITEM)})[${index}];
          const main = document.querySelector('main.content');
          return item?.getAttribute('aria-current') === 'page' && main?.firstElementChild?.getBoundingClientRect().height > 0 })()`,
    )
    // Effects and the first state polls run after the first paint.
    await delay(750)
    await shot(page, `${String(index + 1).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-')}`)
    if (!shown) fail(`${label}: the page did not render`)
    for (const error of errors.slice(before)) fail(`${label}: ${error}`)
    console.log(`[smoke] ${shown && errors.length === before ? 'ok  ' : 'FAIL'} ${label}`)
  }
}

if (shotsDir) mkdirSync(shotsDir, { recursive: true })
const run = await startRun().catch((error) => {
  console.error(`[smoke] ${error.message}`)
  process.exit(1)
})
try {
  const page = await connect(run.port)
  const errors = []
  page.on('Runtime.exceptionThrown', ({ exceptionDetails }) =>
    errors.push(`uncaught: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`))
  page.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error') errors.push(`console.error: ${args.map((arg) => arg.value ?? arg.description ?? '').join(' ')}`)
  })
  await page.send('Runtime.enable')
  try {
    await check(page, errors)
  } finally {
    page.close()
  }
} catch (error) {
  fail(error.message)
} finally {
  await stopRun(run.folder)
}

if (failures.length > 0) {
  console.error(`[smoke] ${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log('[smoke] the app starts, talks to the host, replays telemetry and renders every page')
