import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sourceFiles = [
  './Controls.tsx',
  './DashEditor.tsx',
  './Devices.tsx',
  './Help.tsx',
  './Home.tsx',
  './Settings.tsx',
  '../components/AdditionalSettingsPanel.tsx',
  '../components/AlertsEditor.tsx',
  '../components/ConfirmDialog.tsx',
  '../components/DashList.tsx',
  '../components/UpdateToast.tsx',
  '../components/devices/CatalogPanel.tsx',
  '../components/devices/DeviceCommandRow.tsx',
  '../components/devices/DeviceDetail.tsx',
  '../components/devices/DeviceSection.tsx',
  '../components/devices/DriverMissingBanner.tsx',
  '../components/devices/ScanPicker.tsx',
] as const

const sources = sourceFiles.map((path) => ({
  path,
  contents: readFileSync(new URL(path, import.meta.url), 'utf8'),
}))

const devicesSource = sources.find((entry) => entry.path === './Devices.tsx')?.contents ?? ''
const deviceComponentsSource = sources
  .filter((entry) => entry.path.startsWith('../components/devices/'))
  .map((entry) => entry.contents)
  .join('\n')

test('desktop app surfaces avoid pre-handoff glass and accent drift', () => {
  for (const { path, contents } of sources) {
    assert.doesNotMatch(
      contents,
      /backdrop-blur|\bglass\b|font-display|cyan|teal|purple|#5af8fb|#ff906c|bg-bg-surface|bg-bg-subtle/i,
      `${path} contains a legacy visual class or accent`,
    )
  }
})

test('primary desktop views use the shared handoff page header', () => {
  for (const path of ['./Controls.tsx', './Devices.tsx', './Help.tsx', './Home.tsx', './Settings.tsx']) {
    const source = sources.find((entry) => entry.path === path)?.contents
    assert.ok(source, `${path} was not loaded`)
    assert.match(source, /PageHeader/, `${path} should use shared PageHeader chrome`)
  }
})

test('devices view and components use Figma panel and alert chrome', () => {
  assert.match(devicesSource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[14px\]/)
  assert.match(deviceComponentsSource, /rounded-alert border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[10px\]/)
  assert.match(deviceComponentsSource, /h-8[^'"]*rounded-control/)
  assert.doesNotMatch(`${devicesSource}\n${deviceComponentsSource}`, /bg-bg-|border-border-input|shadow-lg|cyan|purple/)
})
