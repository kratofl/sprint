import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const telemetrySource = readFileSync(new URL('./Telemetry.tsx', import.meta.url), 'utf8')

test('telemetry view uses the Figma dashboard shell and card chrome', () => {
  // 12-column dashboard grid on the Figma spacing scale.
  assert.match(telemetrySource, /grid-cols-12 gap-\[14px\]/)
  // Panels use flat Figma card chrome.
  assert.match(telemetrySource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[14px\]/)
  // No legacy tokens, glassmorphism, mock "Live Session" copy, or non-design fonts/colors.
  assert.doesNotMatch(telemetrySource, /Live Session|bg-bg-|text-text-|font-mono|cyan|purple|backdrop-blur/)
})

test('telemetry view renders live data via shared telemetry components', () => {
  // Reuses the shared @sprint/ui telemetry components rather than bespoke markup.
  assert.match(telemetrySource, /from '@sprint\/ui'/)
  for (const component of ['GearDisplay', 'RPMBar', 'LapTime', 'DeltaBar', 'SectorTimes', 'TireTemp', 'FuelWidget', 'TrackMap', 'SessionHeader']) {
    assert.match(telemetrySource, new RegExp(`\\b${component}\\b`), `expected Telemetry to use ${component}`)
  }
  // Track map is driven by live car world coordinates + lap distance.
  assert.match(telemetrySource, /positionX=\{car\.positionX\}/)
  assert.match(telemetrySource, /trackPosition=\{lap\.trackPosition\}/)
  // No stale placeholder literals from the pre-Graphite mock.
  assert.doesNotMatch(telemetrySource, /'247'|'8,543'|'32\.5'|93\.892/)
})

test('telemetry view shows a Graphite demo frame instead of an empty default dashboard', () => {
  assert.match(telemetrySource, /DEMO_TELEMETRY_FRAME/)
  assert.match(telemetrySource, /const liveFrame = frame \?\? DEMO_TELEMETRY_FRAME/)
  assert.doesNotMatch(telemetrySource, /if \(!frame\)/)
  assert.doesNotMatch(telemetrySource, /Waiting for telemetry/)
})
