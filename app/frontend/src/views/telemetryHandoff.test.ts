import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const telemetrySource = readFileSync(new URL('./Telemetry.tsx', import.meta.url), 'utf8')

test('telemetry view uses the Figma dashboard shell and card chrome', () => {
  assert.match(telemetrySource, /Dashboard/)
  assert.match(telemetrySource, /grid h-full min-h-0 grid-cols-12 gap-\[14px\]/)
  assert.match(telemetrySource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[14px\]/)
  assert.match(telemetrySource, /font-saira[^'"]*tabular-nums/)
  assert.match(telemetrySource, /rounded-alert border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[10px\]/)
  assert.doesNotMatch(telemetrySource, /Live Session|bg-bg-|text-text-|font-mono|cyan|purple/)
})
