import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LineSplitter, readGuideOverlayWanted } from './guideFeed.js'

const state = (drivingGuide: Record<string, unknown>, status: string) => ({ settings: { drivingGuide }, guide: { status } })

test('the overlay opens only when asked for, with something to draw and a lap to draw it from', () => {
  assert.equal(readGuideOverlayWanted(state({ monitorOverlay: true, showLine: true }, 'Ready')), true)
  assert.equal(readGuideOverlayWanted(state({ monitorOverlay: true, showBoards: true }, 'Ready')), true)
  assert.equal(readGuideOverlayWanted(state({ monitorOverlay: false, showLine: true }, 'Ready')), false)
  assert.equal(readGuideOverlayWanted(state({ monitorOverlay: true }, 'Ready')), false)
  assert.equal(readGuideOverlayWanted(state({ monitorOverlay: true, showLine: true }, 'NoLap')), false)
  assert.equal(readGuideOverlayWanted({}), false)
})

test('a line split across chunks is delivered whole, once', () => {
  const splitter = new LineSplitter()
  const bytes = (text: string) => new TextEncoder().encode(text)
  assert.deepEqual(splitter.push(bytes('{"type":"po')), [])
  assert.deepEqual(splitter.push(bytes('se"}\n{"type":"settings"}\n{"a"')), ['{"type":"pose"}', '{"type":"settings"}'])
  assert.deepEqual(splitter.push(bytes(':1}\n')), ['{"a":1}'])
})
