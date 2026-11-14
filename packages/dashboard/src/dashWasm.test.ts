import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadDashWasm } from './dashWasm.js'

// The build the test script writes first (scripts/build-dash-renderer.mjs --wasm).
const wasm = await loadDashWasm(readFileSync(new URL('../generated/sprint_dash.wasm', import.meta.url)))

const layout = { id: 'l', name: 'L', gridCols: 20, gridRows: 12, pages: [{ id: 'p', name: 'P', widgets: [] }] }
const scene = (extra: Record<string, unknown>): string => JSON.stringify({ layout, width: 4, height: 2, ...extra })

test('a scene draws at its device scale, in the dash background colour', () => {
  wasm.setScene(scene({ scale: 2 }))
  assert.deepEqual(wasm.renderStill('', '', 0), { timeDependent: false })
  assert.deepEqual([wasm.width, wasm.height], [8, 4])
  assert.deepEqual([...wasm.pixels().subarray(0, 4)], [0x08, 0x08, 0x0a, 0xff])
  assert.deepEqual([...wasm.imagePixels().subarray(0, 4)], [0x08, 0x08, 0x0a, 0xff])
})

test('a transparent canvas comes out with alpha 0, and straight pixels are unpremultiplied', () => {
  wasm.setScene(scene({ transparent: true }))
  wasm.renderStill('', '', 0)
  assert.equal(wasm.pixels()[3], 0)
  assert.equal(wasm.imagePixels()[3], 0)
})

test("a dash the renderer cannot draw throws the renderer's own message and keeps the last scene", () => {
  wasm.setScene(scene({}))
  assert.throws(() => wasm.setScene('{'), /^Error: scene is not valid JSON/)
  assert.throws(() => wasm.setScene(JSON.stringify({ width: 4, height: 2 })), /scene has no layout object/)
  assert.throws(() => wasm.renderStill('', '{"kind":"setting"}', 0), /./, 'a malformed banner')
  wasm.renderStill('', '', 0)
  assert.deepEqual([wasm.width, wasm.height], [4, 2])
})

test('a crash drops the instance; the next call starts over with the last good scene', () => {
  wasm.setScene(scene({}))
  // 30000 x 30000 x 4 bytes is more than a wasm32 allocation may ask for: Rust panics, and a panic
  // aborts (traps) in WebAssembly. Nothing is allocated first.
  assert.throws(() => wasm.setScene(JSON.stringify({ layout, width: 30000, height: 30000 })), /^Error: the dash renderer crashed/)
  assert.deepEqual(wasm.renderStill('', '', 0), { timeDependent: false })
  assert.deepEqual([wasm.width, wasm.height], [4, 2])
})
