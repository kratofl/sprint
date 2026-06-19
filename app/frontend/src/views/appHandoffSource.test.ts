import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sourceFiles = [
  './Controls.tsx',
  './DashEditor.tsx',
  './Devices.tsx',
  './Engineer.tsx',
  './Help.tsx',
  './Home.tsx',
  './Settings.tsx',
  '../components/AdditionalSettingsPanel.tsx',
  '../components/AlertsEditor.tsx',
  '../components/DashList.tsx',
  '../components/UpdateToast.tsx',
  '../components/devices/CatalogPanel.tsx',
  '../components/devices/DeviceCommandRow.tsx',
  '../components/devices/DeviceDetail.tsx',
  '../components/devices/DeviceSection.tsx',
  '../components/devices/DriverMissingBanner.tsx',
  '../components/devices/ScanPicker.tsx',
] as const

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')

const sources = sourceFiles.map((path) => ({
  path,
  contents: readFileSync(new URL(path, import.meta.url), 'utf8'),
}))

const devicesSource = sources.find((entry) => entry.path === './Devices.tsx')?.contents ?? ''
const homeSource = sources.find((entry) => entry.path === './Home.tsx')?.contents ?? ''
const settingsSource = sources.find((entry) => entry.path === './Settings.tsx')?.contents ?? ''
const helpSource = sources.find((entry) => entry.path === './Help.tsx')?.contents ?? ''
const updateToastSource = sources.find((entry) => entry.path === '../components/UpdateToast.tsx')?.contents ?? ''
const catalogPanelSource = sources.find((entry) => entry.path === '../components/devices/CatalogPanel.tsx')?.contents ?? ''
const deviceCommandRowSource = sources.find((entry) => entry.path === '../components/devices/DeviceCommandRow.tsx')?.contents ?? ''
const deviceSectionSource = sources.find((entry) => entry.path === '../components/devices/DeviceSection.tsx')?.contents ?? ''
const deviceComponentsSource = sources
  .filter((entry) => entry.path.startsWith('../components/devices/'))
  .map((entry) => entry.contents)
  .join('\n')

test('desktop app surfaces avoid pre-Graphite glass and accent drift', () => {
  for (const { path, contents } of sources) {
    assert.doesNotMatch(
      contents,
      /backdrop-blur|\bglass\b|font-display|font-inter|font-mono|font-saira|cyan|teal|purple|#5af8fb|#ff906c|bg-bg-surface|bg-bg-subtle|bg-bg-panel|text-foreground|text-text-/i,
      `${path} contains a legacy visual class or accent`,
    )
  }
})

test('primary desktop views use the shared handoff page header', () => {
  for (const path of ['./Devices.tsx', './Help.tsx', './Home.tsx', './Settings.tsx']) {
    const source = sources.find((entry) => entry.path === path)?.contents
    assert.ok(source, `${path} was not loaded`)
    assert.match(source, /PageHeader/, `${path} should use shared PageHeader chrome`)
  }
})

test('Home owns live, engineer, and setup instead of separate top-level pages', () => {
  assert.match(homeSource, /<Telemetry frame=\{frame\} connected=\{connected\} fps=\{fps\} \/>/)
  assert.match(homeSource, /<Engineer connected=\{connected\} \/>/)
  assert.match(homeSource, /<Controls compact \/>/)
  assert.doesNotMatch(appSource, /import Telemetry/)
  assert.doesNotMatch(appSource, /import Controls/)
  assert.doesNotMatch(appSource, /view === 'live'/)
  assert.doesNotMatch(appSource, /view === 'setup'/)
})

test('devices view and components use Graphite page layout primitives', () => {
  assert.match(devicesSource, /\bds-page\b/)
  assert.match(deviceComponentsSource, /\bds-dev\b/)
  assert.match(deviceComponentsSource, /\bds-dev-list\b/)
  assert.match(deviceComponentsSource, /\bds-devpick\b/)
  assert.match(deviceComponentsSource, /\bds-adddev\b/)
  assert.match(deviceSectionSource, /\bModal\b/)
  assert.match(deviceComponentsSource, /\bds-bindwrap\b/)
  assert.match(deviceCommandRowSource, /\bSettingsRow\b/)
  assert.match(deviceCommandRowSource, /\bKeyChip\b/)
  assert.match(deviceComponentsSource, /deviceBindingListenState/)
  assert.match(deviceComponentsSource, /buttonNumberFromKeyboardKey/)
  assert.match(deviceComponentsSource, /\bConfirmDialog\b/)
  assert.match(deviceSectionSource, /isMissingWailsMethod\(error, 'DeviceGetSavedDevices'\)/)
  assert.match(deviceSectionSource, /setError\(null\)[\s\S]*setDevices\(\[\]\)/)
  assert.match(deviceSectionSource, /getScreenStatus\(\)\.then\(setScreenStatus\)\.catch\(\(\) => setScreenStatus\('unknown'\)\)/)
  assert.doesNotMatch(`${deviceCommandRowSource}\n${catalogPanelSource}`, /\b(ds-bind|ds-btn-key|ds-modal)\b/)
  assert.doesNotMatch(`${devicesSource}\n${deviceComponentsSource}`, /bg-bg-|border-border-input|shadow-lg|cyan|purple/)
})

test('system views compose shared Graphite primitives instead of local chrome classes', () => {
  for (const primitive of ['SettingsCard', 'SettingsRow', 'SegmentedControl', 'Select', 'StatusPill']) {
    assert.match(settingsSource, new RegExp(`\\b${primitive}\\b`), `Settings should use shared ${primitive}`)
  }

  for (const primitive of ['SettingsCard', 'SettingsRow', 'KeyChip']) {
    assert.match(helpSource, new RegExp(`\\b${primitive}\\b`), `Help should use shared ${primitive}`)
  }

  assert.doesNotMatch(settingsSource, /\b(ds-set-|fseg|ds-input|ds-pill)\b/)
  assert.doesNotMatch(settingsSource, /window\.confirm/)
  assert.match(settingsSource, /\bConfirmDialog\b/)
  assert.doesNotMatch(helpSource, /\b(ds-set-|ds-btn-key)\b/)
  assert.match(updateToastSource, /border border-\[var\(--line\)\] bg-\[var\(--panel\)\]/)
  assert.doesNotMatch(`${settingsSource}\n${helpSource}\n${updateToastSource}`, /shadow-lg|backdrop-blur|bg-bg-|text-text-/)
})
