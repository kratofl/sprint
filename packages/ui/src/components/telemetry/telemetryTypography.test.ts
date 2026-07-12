import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gearDisplaySource = readFileSync(new URL('./GearDisplay.tsx', import.meta.url), 'utf8')
const deltaBarSource = readFileSync(new URL('./DeltaBar.tsx', import.meta.url), 'utf8')
const inputTraceSource = readFileSync(new URL('./InputTrace.tsx', import.meta.url), 'utf8')

test('telemetry numeric hero values use Inter tabular typography', () => {
  assert.match(gearDisplaySource, /font-sans/)
  assert.match(gearDisplaySource, /tabular-nums/)
  assert.doesNotMatch(gearDisplaySource, /font-saira|font-mono|font-display/)
})

test('telemetry semantic values use orange green and red tokens only', () => {
  assert.match(deltaBarSource, /text-\[var\(--green\)\]/)
  assert.match(deltaBarSource, /text-\[var\(--red\)\]/)
  assert.match(inputTraceSource, /var\(--green\)/)
  assert.match(inputTraceSource, /var\(--red\)/)
  assert.doesNotMatch(`${deltaBarSource}\n${inputTraceSource}`, /cyan|teal|text-success|text-destructive/i)
})
