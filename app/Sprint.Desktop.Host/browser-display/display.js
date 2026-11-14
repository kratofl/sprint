// A Browser / VR display: reads its display's feed from Sprint's host (BrowserDisplayServer.cs) and
// draws the dash with the wheel's own renderer in WebAssembly (dashWasm.js, the dashboard package's
// glue, copied next to this file by the host's build).
//
// The feed is newline-delimited JSON: {"scene":...} when what the dash shows changes, {"frame":...}
// per telemetry frame, and an empty line when nothing else went out for a second. One canvas at the
// scene's resolution, scaled to the window by CSS. It paints only when a frame or the scene changed,
// or while the renderer says the picture moves by itself (a banner, the lap timer), and only on an
// animation frame, so a hidden page or an unchanged dash paints nothing.

import { loadDashWasm } from '/assets/dashWasm.js'

/** No data for this long is "No signal": better than a frozen picture. */
const NO_SIGNAL_AFTER_MS = 3000
const RETRY_MS = 1000
const NOT_SERVED = 'Sprint is not running, or not serving this display.'
// The host writes a frame line as exactly this prefix, the frame's JSON and "}" (FrameLineFor).
const FRAME_PREFIX = '{"frame":'

const root = document.documentElement
const canvas = document.getElementById('dash')
const context = canvas.getContext('2d')
const message = document.getElementById('message')
const title = document.getElementById('title')
const detail = document.getElementById('detail')
const feedUrl = `${location.pathname.replace(/\/+$/, '')}/feed`

let renderer = null
let hasScene = false
let transparent = false
let frameJson = ''
let dirty = false
let timeDependent = false
let scheduled = false
let lastDataAt = Date.now()
let signal = false
let noSignalReason = NOT_SERVED

// Every change to the page goes through a check first: writing the same value again can still
// repaint, and an unchanged page must not produce a frame.
function setHidden(element, hidden) {
  if (element.hidden !== hidden) element.hidden = hidden
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text
}

function setOpaque(opaque) {
  if (root.classList.contains('opaque') !== opaque) root.classList.toggle('opaque', opaque)
}

/** Shows a message instead of the dash, over black. */
function showMessage(text, more = '') {
  setHidden(canvas, true)
  setOpaque(true)
  setText(title, text)
  setText(detail, more)
  setHidden(detail, more === '')
  setHidden(message, false)
}

const errorText = (error) => (error instanceof Error ? error.message : String(error))

function schedule() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(paint)
}

function paint() {
  scheduled = false
  if (!renderer || !hasScene || !signal || (!dirty && !timeDependent)) return
  dirty = false
  try {
    timeDependent = renderer.renderLive(frameJson, performance.now()).timeDependent
  } catch (error) {
    // A frame it cannot draw: said on the page, and tried again with the next frame.
    timeDependent = false
    showMessage("Can't draw this dash", errorText(error))
    return
  }
  const { width, height } = renderer
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  context.putImageData(new ImageData(renderer.imagePixels(), width, height), 0, 0)
  setHidden(message, true)
  setHidden(canvas, false)
  setOpaque(!transparent)
  if (timeDependent) schedule()
}

function onScene(scene) {
  if (scene === null) {
    hasScene = false
    showMessage('No dash to show', 'Pick a dash for this display on Sprint’s Devices page.')
    return
  }
  try {
    renderer.setScene(JSON.stringify(scene))
  } catch (error) {
    // A scene it cannot draw stays refused until the next one.
    hasScene = false
    showMessage("Can't draw this dash", errorText(error))
    return
  }
  transparent = scene.transparent === true
  hasScene = true
  dirty = true
  schedule()
}

function onLine(line) {
  if (line.startsWith(FRAME_PREFIX)) {
    frameJson = line.slice(FRAME_PREFIX.length, -1)
    dirty = true
    schedule()
    return
  }
  const parsed = JSON.parse(line)
  if (parsed !== null && typeof parsed === 'object' && 'scene' in parsed) onScene(parsed.scene)
}

/** Reads one connection of the feed until it ends; throws with the host's reason when refused. */
async function readFeed() {
  const response = await fetch(feedUrl, { cache: 'no-store' })
  if (!response.ok) {
    const text = (await response.text()).trim()
    throw new Error(text || `The feed answered HTTP ${response.status}.`)
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffered = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    lastDataAt = Date.now()
    // Said if the feed now stalls while still open.
    noSignalReason = 'Sprint stopped sending this display.'
    if (!signal) {
      signal = true
      dirty = true
      schedule()
    }
    buffered += value
    let end
    while ((end = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, end)
      buffered = buffered.slice(end + 1)
      if (line !== '') onLine(line)
    }
  }
}

async function loadRenderer() {
  for (;;) {
    try {
      return await loadDashWasm(fetch('/assets/sprint_dash.wasm'))
    } catch (error) {
      showMessage('The dash renderer could not be loaded', errorText(error))
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
    }
  }
}

// "No signal" once nothing arrived for a while: the picture is cleared, not left frozen.
setInterval(() => {
  if (Date.now() - lastDataAt < NO_SIGNAL_AFTER_MS) return
  signal = false
  timeDependent = false
  showMessage('No signal', noSignalReason)
}, 1000)

renderer = await loadRenderer()
for (;;) {
  try {
    await readFeed()
    noSignalReason = 'Sprint stopped serving this display.'
  } catch (error) {
    // fetch rejects with a TypeError when nothing answers at all.
    noSignalReason = error instanceof TypeError ? NOT_SERVED : errorText(error)
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
}
