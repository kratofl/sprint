// A small DevTools-protocol client for one window of a running app (an agent run, scripts/agent-app.mjs).
// cdp.mjs drives a run one step per call; smoke.mjs keeps one connection open to also hear errors.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** The CDP port of a run folder (its run.json) or a port given directly; null when neither says. */
export function cdpPort(where) {
  if (/^\d+$/.test(where)) return Number(where)
  const runFile = path.join(path.resolve(where), 'run.json')
  return existsSync(runFile) ? JSON.parse(readFileSync(runFile, 'utf8')).cdpPort ?? null : null
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
export const knownKeys = Object.keys(KEYS)

/**
 * Connects to the first page whose URL holds `pick` (the main window by default). Throws when
 * nothing listens or no window matches. `on(method, handler)` hears CDP events once their
 * domain is enabled (e.g. `send('Runtime.enable')`).
 */
export async function connect(port, pick = 'backdrop=window') {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
    (response) => response.json(),
    () => {
      throw new Error(`nothing listens on ${port}`)
    },
  )
  const page = targets.find((target) => target.type === 'page' && target.url.includes(pick))
  if (!page) throw new Error(`no open window matches ${pick}`)

  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('could not connect')), { once: true })
  })
  let nextId = 1
  const pending = new Map()
  const listeners = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.method) {
      for (const handler of listeners.get(message.method) ?? []) handler(message.params)
      return
    }
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

  /** The (awaited) value of `expression` in the page; throws what the page threw. */
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
    return result.value
  }

  /** The centre of the `index`th match, once it exists and has a size; null after `timeoutMs`. */
  const locate = async (selector, timeoutMs = 5000, index = 0) => {
    const deadline = Date.now() + timeoutMs
    const probe = `(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`
    while (Date.now() < deadline) {
      const point = await evaluate(probe)
      if (point) return point
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return null
  }

  /** Clicks the `index`th match with real mouse events, so React sees a real click. */
  const click = async (selector, index = 0) => {
    const point = await locate(selector, 5000, index)
    if (!point) throw new Error(`nothing visible matches ${selector}${index > 0 ? ` [${index}]` : ''}`)
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 })
    }
  }

  const press = async (key) => {
    const spec = KEYS[key]
    if (!spec) throw new Error(`unknown key ${key} (known: ${knownKeys.join(', ')})`)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, ...(spec.text ? { text: spec.text } : {}) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: spec.code, windowsVirtualKeyCode: spec.keyCode })
  }

  const on = (method, handler) => listeners.set(method, [...(listeners.get(method) ?? []), handler])

  return { send, evaluate, locate, click, press, on, close: () => socket.close() }
}
