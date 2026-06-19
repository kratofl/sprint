import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(
  new URL('../App.tsx', import.meta.url),
  'utf8',
)

test('right header cluster stretches window controls to the full titlebar height', () => {
  assert.match(
    appSource,
    /className=\{windowControlsRailClassName\}/,
  )
})

test('desktop titlebar uses the Dash Studio 40px titlebar and breadcrumb slots', () => {
  assert.match(appSource, /<Titlebar/)
  assert.match(appSource, /SPRINT TELEMETRY/)
  assert.match(appSource, /Assetto Corsa|NO SIGNAL/)
  assert.match(appSource, /const demoTelemetryActive = !frame && !connected/)
  assert.match(appSource, /const titlebarConnected = connected \|\| demoTelemetryActive/)
  assert.match(appSource, /const titlebarFps = fps \|\| \(demoTelemetryActive \? 60 : 0\)/)
})

test('desktop shell fills the OS window with the sidebar and body tray', () => {
  assert.match(appSource, /<AppShell/)
  assert.match(appSource, /<BodyTray/)
  assert.doesNotMatch(appSource, /h-\[883px\]|w-\[1570px\]|wallpaperUrl|backgroundImage/)
  assert.match(appSource, /sidebarCollapsed/)
  assert.match(appSource, /IconLayoutSidebarLeftCollapse|IconLayoutSidebarLeftExpand/)
  assert.doesNotMatch(appSource, /sidebarCollapsed \? 'w-\[62px\][^']*' : 'w-\[208px\][^']*'/)
  assert.doesNotMatch(appSource, /className="flex min-w-0 flex-1 flex-col p-\[10px\]"/)
  assert.doesNotMatch(appSource, /rounded-\[calc\(var\(--r\)\+2px\)\] border border-\[var\(--line2\)\] bg-\[var\(--bg\)\]/)
})

test('desktop shell uses the grouped Dash Studio navigation model', () => {
  assert.doesNotMatch(appSource, /<PageTabs/)
  assert.match(appSource, /id:\s*'home'[\s\S]*label:\s*'Home'/)
  assert.match(appSource, /label:\s*'Devices'[\s\S]*id:\s*'devices'[\s\S]*label:\s*'Devices'/)
  assert.match(appSource, /id:\s*'dashboards'[\s\S]*label:\s*'Dashboards'/)
  assert.match(appSource, /pinned:\s*'bottom'[\s\S]*id:\s*'settings'[\s\S]*label:\s*'Settings'/)
  assert.match(appSource, /id:\s*'help'[\s\S]*label:\s*'Help'/)
})
