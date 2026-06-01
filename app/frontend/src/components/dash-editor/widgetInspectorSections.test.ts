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
  assert.match(dashEditModeSource, /<SidebarDisclosureSection title="STYLE"/)
  assert.match(dashEditModeSource, /<SidebarDisclosureSection[\s\S]{0,120}title="ADVANCED_GEOMETRY"/)
  assert.doesNotMatch(dashEditModeSource, /<SidebarSection title="WIDGET">/)
  assert.match(dashEditModeSource, /aria-expanded=\{open\}/)
})

test('widget properties no longer render redundant widget meta summary or inline style heading', () => {
  assert.doesNotMatch(widgetPropertiesSource, /widget\.col},\{widget\.row} · \{widget\.colSpan}×\{widget\.rowSpan}/)
  assert.doesNotMatch(widgetPropertiesSource, />Style</)
})
