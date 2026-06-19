import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dashEditModeSource = readFileSync(
  new URL('../DashEditMode.tsx', import.meta.url),
  'utf8',
)

const widgetPropertiesSource = readFileSync(
  new URL('../WidgetProperties.tsx', import.meta.url),
  'utf8',
)

test('widget inspector uses disclosure sections for style and advanced geometry instead of a WIDGET wrapper section', () => {
  assert.match(dashEditModeSource, /<SidebarDisclosureSection title="Style"/)
  assert.match(dashEditModeSource, /<SidebarDisclosureSection[\s\S]{0,120}title="Advanced geometry"/)
  assert.doesNotMatch(dashEditModeSource, /<SidebarSection title="WIDGET">/)
  assert.match(dashEditModeSource, /aria-expanded=\{open\}/)
})

test('widget properties no longer render redundant widget meta summary or inline style heading', () => {
  assert.doesNotMatch(widgetPropertiesSource, /widget\.col},\{widget\.row} · \{widget\.colSpan}×\{widget\.rowSpan}/)
  assert.doesNotMatch(widgetPropertiesSource, />Style</)
})

test('widget editor labels use handoff UI labels instead of terminal mono uppercase styling', () => {
  assert.doesNotMatch(dashEditModeSource, /terminal-header/)
  assert.doesNotMatch(dashEditModeSource, /font-mono text-\[9px\] uppercase/)
  assert.doesNotMatch(dashEditModeSource, /font-mono text-\[10px\] font-medium uppercase/)
  assert.doesNotMatch(widgetPropertiesSource, /font-mono text-\[9px\][^'"]*uppercase/)
})

test('widget inspector fields use shared Graphite form primitives', () => {
  for (const primitive of ['Input', 'Select', 'SelectTrigger', 'SelectContent', 'SelectItem', 'Stepper', 'IconButton']) {
    assert.match(widgetPropertiesSource, new RegExp(`\\b${primitive}\\b`), `${primitive} is missing from widget properties`)
  }
  assert.match(widgetPropertiesSource, /const inspectorLabelClassName = 'ui-label text-\[11px\] text-\[var\(--muted\)\]'/)
  assert.doesNotMatch(widgetPropertiesSource, /inspectorInputClassName/)
  assert.doesNotMatch(widgetPropertiesSource, /focus:border-\[var\(--orange\)\]/)
  assert.match(dashEditModeSource, /\bStepper\b/)
  assert.match(dashEditModeSource, /\bInput\b/)
  assert.match(dashEditModeSource, /className="ui-label text-\[11px\] text-\[var\(--muted\)\]"/)
})
