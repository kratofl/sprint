import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const telemetrySource = readFileSync(new URL('./Telemetry.tsx', import.meta.url), 'utf8')

test('telemetry view uses the Figma dashboard shell and card chrome', () => {
  // 12-column dashboard grid on the Figma spacing scale.
  assert.match(telemetrySource, /grid-cols-12 gap-\[14px\]/)
  // Panels compose the shared flat Card primitive (Graphite card chrome).
  assert.match(telemetrySource, /<Card\b/)
  assert.match(telemetrySource, /\bCardTitle\b/)
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

test('telemetry view renders an empty/waiting state instead of demo data when no frame is live', () => {
  // No hardcoded demo frame is shipped anymore — nothing fake renders when no game runs.
  assert.doesNotMatch(telemetrySource, /DEMO_TELEMETRY_FRAME/)
  // The view distinguishes "no frame" and shows a real empty state rather than substituting data.
  assert.match(telemetrySource, /if \(!frame\) return <TelemetryEmptyState/)
  assert.match(telemetrySource, /Waiting for telemetry/)
  assert.match(telemetrySource, /No sim connected/)
})
