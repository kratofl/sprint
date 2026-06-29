import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(
  new URL('../App.tsx', import.meta.url),
  'utf8',
)

const windowControlsSource = readFileSync(
  new URL('../components/shell/WindowControls.tsx', import.meta.url),
  'utf8',
)

test('the single content header hosts the window controls cluster', () => {
  assert.match(appSource, /<WindowControls\s*\/>/)
  assert.match(windowControlsSource, /windowAPI\.minimise/)
  assert.match(windowControlsSource, /windowAPI\.toggleMaximise/)
  assert.match(windowControlsSource, /windowAPI\.close/)
})

test('desktop shell uses one content header (Figma) instead of a full-width titlebar', () => {
  // No stacked app-titlebar + view-toolbar chrome.
  assert.doesNotMatch(appSource, /<Titlebar/)
  assert.doesNotMatch(appSource, /<BodyTray/)
  assert.doesNotMatch(appSource, /SPRINT TELEMETRY/)
  // The header is a Wails drag region; views inject their toolbar via the slot.
  assert.match(appSource, /app-region="drag"/)
  assert.match(appSource, /ShellHeaderSlotProvider/)
  // No global prev/next history buttons and no connection/"Sim Demo" pill (not in Figma).
  assert.doesNotMatch(appSource, /Assetto Corsa|Sim Demo|label="Forward"/)
})

test('desktop shell fills the OS window with the sidebar brand and content column', () => {
  assert.match(appSource, /<AppShell/)
  assert.match(appSource, /<NavRail/)
  assert.match(appSource, /<SidebarBrand/)
  assert.doesNotMatch(appSource, /h-\[883px\]|w-\[1570px\]|wallpaperUrl|backgroundImage/)
  assert.match(appSource, /sidebarCollapsed/)
  assert.doesNotMatch(appSource, /sidebarCollapsed \? 'w-\[62px\][^']*' : 'w-\[208px\][^']*'/)
})

test('desktop shell uses the grouped Dash Studio navigation model', () => {
  assert.doesNotMatch(appSource, /<PageTabs/)
  assert.match(appSource, /id:\s*'home'[\s\S]*label:\s*'Home'/)
  assert.match(appSource, /label:\s*'Devices'[\s\S]*id:\s*'devices'[\s\S]*label:\s*'Devices'/)
  assert.match(appSource, /id:\s*'dashboards'[\s\S]*label:\s*'Dashboards'/)
  assert.match(appSource, /pinned:\s*'bottom'[\s\S]*id:\s*'settings'[\s\S]*label:\s*'Settings'/)
  assert.match(appSource, /id:\s*'help'[\s\S]*label:\s*'Help'/)
})
