#!/usr/bin/env node
// Drives the main window of an agent run (scripts/agent-app.mjs) over the DevTools protocol.
// One command per call, so each step can be checked before the next:
//
//   node scripts/cdp.mjs <run folder | port> shot <out.png>      screenshot of the window
//   node scripts/cdp.mjs <run folder | port> click <selector>    click the first match (waits up to 5 s)
//   node scripts/cdp.mjs <run folder | port> type <selector> <text>  focus it, select all, type the text
//   node scripts/cdp.mjs <run folder | port> key <key>           press a key: Enter, Escape, Tab, ArrowDown, …
//   node scripts/cdp.mjs <run folder | port> eval <expression>   print the (awaited) result as JSON
//   node scripts/cdp.mjs <run folder | port> wait <selector> [ms]  until it exists (default 5 s)
//
// Clicks and keys go through Input.dispatch*, so React sees real events. The window is hidden,
// so a click lands on the element's centre whatever is on the screen.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [where, command, ...args] = process.argv.slice(2)
const fail = (message) => {
  console.error(`[cdp] ${message}`)
  process.exit(1)
}
if (!where || !command) fail('usage: cdp.mjs <run folder | port> <shot|click|type|key|eval|wait> …')

const runFile = path.join(path.resolve(where), 'run.json')
const port = /^\d+$/.test(where) ? Number(where) : existsSync(runFile) ? JSON.parse(readFileSync(runFile, 'utf8')).cdpPort : null
if (!port) fail(`no CDP port for ${where} (is the run up yet?)`)

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json(), () => fail(`nothing listens on ${port}`))
// SPRINT_CDP_PAGE=<text> drives another window instead, the first whose URL holds that text (e.g. pitwall=main).
const pick = process.env.SPRINT_CDP_PAGE ?? 'backdrop=window'
const main = targets.find((target) => target.type === 'page' && target.url.includes(pick))
if (!main) fail(`no open window matches ${pick}`)

const socket = new WebSocket(main.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', () => reject(new Error('could not connect')), { once: true })
})
let nextId = 1
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data))
  const waiter = pending.get(message.id)
  if (!waiter) return
  pending.delete(message.id)
  if (message.error) waiter.reject(new Error(message.error.message))
  else waiter.resolve(message.result)
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (exceptionDetails) fail(exceptionDetails.exception?.description ?? exceptionDetails.text)
  return result.value
}

/** The centre of the first match, once it exists and has a size; null after `timeoutMs`. */
const locate = async (selector, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs
  const probe = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`
  while (Date.now() < deadline) {
    const point = await evaluate(probe)
    if (point) return point
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

const click = async (selector) => {
  const point = await locate(selector)
  if (!point) fail(`nothing visible matches ${selector}`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 })
  }
}

// The keys a step needs; anything else is typed as text.
const KEYS = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Escape: { code: 'Escape', keyCode: 27 },
  Tab: { code: 'Tab', keyCode: 9 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
}
const press = async (key) => {
  const spec = KEYS[key]
  if (!spec) fail(`unknown key ${key} (known: ${Object.keys(KEYS).join(', ')})`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, ...(spec.text ? { text: spec.text } : {}) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: spec.code, windowsVirtualKeyCode: spec.keyCode })
}

try {
  if (command === 'shot') {
    const out = args[0] ?? fail('shot needs an output path')
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(out, Buffer.from(data, 'base64'))
    console.log(`[cdp] wrote ${path.resolve(out)}`)
  } else if (command === 'click') {
    await click(args[0] ?? fail('click needs a selector'))
  } else if (command === 'type') {
    const [selector, text] = args
    if (!selector || text === undefined) fail('type needs a selector and the text')
    await click(selector)
    await evaluate(`document.activeElement?.select?.()`)
    await send('Input.insertText', { text })
  } else if (command === 'key') {
    await press(args[0] ?? fail('key needs a key name'))
  } else if (command === 'eval') {
    console.log(JSON.stringify(await evaluate(args[0] ?? fail('eval needs an expression')), null, 2))
  } else if (command === 'wait') {
    const selector = args[0] ?? fail('wait needs a selector')
    if (!(await locate(selector, Number(args[1] ?? 5000)))) fail(`${selector} did not show up`)
  } else {
    fail(`unknown command ${command}`)
  }
} finally {
  socket.close()
}
