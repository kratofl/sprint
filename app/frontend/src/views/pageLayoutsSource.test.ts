import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const dashListSource = read('../components/DashList.tsx')
const dashEditModeSource = read('../components/DashEditMode.tsx')
const dashCanvasSource = read('../components/DashCanvas.tsx')
const dashEditorSource = read('./DashEditor.tsx')
const homeSource = read('./Home.tsx')
const engineerSource = read('./Engineer.tsx')
const telemetrySource = read('./Telemetry.tsx')
const controlsSource = read('./Controls.tsx')
const devicesSource = read('./Devices.tsx')
const deviceSectionSource = read('../components/devices/DeviceSection.tsx')
const deviceDetailSource = read('../components/devices/DeviceDetail.tsx')
const deviceCommandRowSource = read('../components/devices/DeviceCommandRow.tsx')
const catalogPanelSource = read('../components/devices/CatalogPanel.tsx')
const settingsSource = read('./Settings.tsx')
const helpSource = read('./Help.tsx')
const appStylesSource = read('../index.css')
const graphiteLayoutStylesSource = read('../styles/graphite-layout.css')
const globalsSource = read('../../../../packages/tokens/globals.css')

test('shared stylesheet remains token-only instead of defining app-local layout classes', () => {
  for (const className of [
    'ds-page',
    'ds-head',
    'ds-set-grid',
    'ds-set-card',
    'ds-set-row',
    'ds-col',
    'ds-settings-wrap',
    'ds-btn-key',
    'fseg',
    'icobtn',
    'ds-modal',
    'ds-editor',
    'ds-etop',
    'ds-pagebar',
    'ds-ework',
    'ds-dev',
    'ds-dev-list',
    'ds-devpick',
    'ds-bindwrap',
  ]) {
    assert.doesNotMatch(globalsSource, new RegExp(`\\.${className}\\b`), `${className} should live in shared UI or page composition, not tokens`)
  }
})

test('app stylesheet includes Graphite page and editor layout classes', () => {
  assert.match(appStylesSource, /@import '\.\/styles\/graphite-layout\.css';/)
  for (const className of [
    'ds-page',
    'ds-head',
    'ds-dash-grid',
    'ds-editor',
    'ds-etop',
    'ds-pagebar',
    'ds-ework',
    'ds-col',
    'ds-canvas-wrap',
    'ds-canvas-stage',
    'ds-dev',
    'ds-bindwrap',
  ]) {
    assert.match(graphiteLayoutStylesSource, new RegExp(`\\.${className}\\b`), `${className} style is missing from the app stylesheet import`)
  }
})

test('Dashboards list uses the spec page wrapper and card grid', () => {
  assert.match(dashListSource, /\bds-page\b/)
  assert.match(dashListSource, /\bds-dash-grid\b/)
  assert.match(dashListSource, /minmax\(300px,\s*1fr\)|ds-dash-grid/)
  assert.match(dashListSource, /\bds-dash-card\b/)
  assert.match(dashListSource, /\bds-dash-create\b/)
  assert.match(dashListSource, /\bds-dash-preview\b/)
  assert.match(dashListSource, /\bBadge\b/)
  assert.doesNotMatch(dashListSource, /\bds-pill\b/)
})

test('Dashboards is the user-facing name for the dash editor area', () => {
  assert.match(dashEditorSource, /heading="Dashboards"/)
  assert.match(dashEditorSource, /dashboard creation, live preview/)
  assert.match(dashListSource, /heading="Dashboards"/)
  assert.match(dashListSource, /Create dashboard/)
  assert.match(dashListSource, /Edit dashboard/)
  assert.match(dashListSource, /Delete dashboard/)
  assert.doesNotMatch(dashListSource, /Dash Studio/)
  assert.doesNotMatch(dashListSource, />Dashes</)
  assert.match(dashEditModeSource, />Dashboards</)
})

test('Dash editor uses the top bar, fixed rails, workspace, and reference canvas primitives', () => {
  for (const className of ['ds-editor', 'ds-etop', 'ds-back', 'ds-etitle', 'ds-ework', 'ds-col', 'ds-canvas-wrap', 'ds-canvas-stage', 'ds-reference-canvas']) {
    assert.match(dashEditModeSource, new RegExp(`\\b${className}\\b`), `${className} is missing`)
  }
  assert.match(dashEditModeSource, /\bSegmentedControl\b/)
  assert.match(dashEditModeSource, /\bIconButton\b/)
  assert.doesNotMatch(dashEditModeSource, /\bfseg\b|\bicobtn\b/)
  assert.match(dashEditModeSource, /data-layout="reference"/)
  assert.doesNotMatch(dashEditModeSource, /data-palette-docked=|data-inspector-docked=/)
  assert.match(dashEditModeSource, /Layout/)
  assert.match(dashEditModeSource, /Alerts/)
  assert.match(dashEditModeSource, /Settings/)
})

test('Dash editor workspace CSS uses fixed reference rails and a responsive fallback', () => {
  assert.match(graphiteLayoutStylesSource, /grid-template-columns:\s*288px minmax\(0,\s*1fr\) 280px/)
  assert.match(graphiteLayoutStylesSource, /@media \(max-width:\s*1180px\)/)
  assert.match(graphiteLayoutStylesSource, /\.ds-ework \.ds-col\[data-side="right"\]/)
  assert.doesNotMatch(graphiteLayoutStylesSource, /data-palette-docked|data-inspector-docked/)
})

test('Dash editor grid overlay can be toggled from the toolbar', () => {
  assert.match(dashCanvasSource, /showGrid\?: boolean/)
  assert.match(dashCanvasSource, /showGrid = true/)
  assert.match(dashEditModeSource, /const \[showGrid, setShowGrid\] = useState\(true\)/)
  assert.match(dashEditModeSource, /aria-pressed=\{showGrid\}/)
  assert.match(dashEditModeSource, /showGrid=\{showGrid\}/)
})

test('Home combines Live, Engineer, and Setup as local segmented sections', () => {
  assert.match(homeSource, /type HomeSection = 'live' \| 'engineer' \| 'setup'/)
  assert.match(homeSource, /<SegmentedControl/)
  assert.match(homeSource, /variant="neutral"/)
  assert.match(homeSource, /<Telemetry frame=\{frame\} connected=\{connected\} fps=\{fps\} \/>/)
  assert.match(homeSource, /<Engineer connected=\{connected\} \/>/)
  assert.match(homeSource, /<Controls compact \/>/)
  assert.doesNotMatch(homeSource, /onNavigate|NavigableView/)
})

test('Engineer workflow lives outside Home while preserving setup helpers', () => {
  for (const helper of [
    'createEngineerState',
    'stageEngineerControl',
    'pushEngineerStagedChanges',
    'revertEngineerStagedChanges',
    'appendEngineerRadioLog',
  ]) {
    assert.match(engineerSource, new RegExp(`export function ${helper}\\b`), `${helper} should be exported from Engineer`)
    assert.doesNotMatch(homeSource, new RegExp(`export function ${helper}\\b`), `${helper} should not stay in Home`)
  }

  assert.match(engineerSource, /export default function Engineer/)
  assert.match(engineerSource, /PageHeader/)
})

test('Telemetry and Controls can be embedded inside the Home hub', () => {
  assert.match(telemetrySource, /export default function Telemetry/)
  assert.doesNotMatch(telemetrySource, /PageHeader/)
  assert.match(controlsSource, /compact\?: boolean/)
  assert.match(controlsSource, /export default function Controls/)
  assert.match(controlsSource, /compact = false/)
  assert.match(controlsSource, /!compact &&/)
})

test('Devices follows the 240px picker plus binding panel spec', () => {
  assert.match(devicesSource, /\bds-page\b/)
  assert.match(deviceSectionSource, /\bds-dev\b/)
  assert.match(deviceSectionSource, /\bds-dev-list\b/)
  assert.match(deviceSectionSource, /\bds-devpick\b/)
  assert.match(deviceSectionSource, /\bds-adddev\b/)
  assert.match(deviceSectionSource, /\bModal\b/)
  assert.match(deviceDetailSource, /\bds-bindwrap\b/)
  assert.match(deviceDetailSource, /\bds-dev-head\b/)
  assert.match(deviceDetailSource, /\bSegmentedControl\b/)
  assert.match(deviceDetailSource, /\bSelectTrigger\b/)
  assert.match(deviceDetailSource, /\bSettingsRow\b/)
  assert.match(deviceDetailSource, /\bConfirmDialog\b/)
  assert.match(deviceDetailSource, /listeningCommandId/)
  assert.match(deviceDetailSource, /buttonNumberFromKeyboardKey/)
  assert.doesNotMatch(deviceDetailSource, /<select\b/)
  assert.match(deviceCommandRowSource, /\bSettingsRow\b/)
  assert.match(deviceCommandRowSource, /\bKeyChip\b/)
  assert.match(deviceCommandRowSource, /Press a button/)
  assert.match(catalogPanelSource, /space-y-\[14px\]/)
  assert.doesNotMatch(`${deviceCommandRowSource}\n${catalogPanelSource}`, /\b(ds-bind|ds-btn-key|ds-modal)\b/)
})

test('Settings and Help use shared settings primitives instead of app-local chrome', () => {
  for (const primitive of ['SettingsCard', 'SettingsRow', 'SegmentedControl', 'Select', 'StatusPill']) {
    assert.match(settingsSource, new RegExp(`\\b${primitive}\\b`), `${primitive} is missing from Settings`)
  }

  for (const primitive of ['SettingsCard', 'SettingsRow', 'KeyChip']) {
    assert.match(helpSource, new RegExp(`\\b${primitive}\\b`), `${primitive} is missing from Help`)
  }

  assert.doesNotMatch(settingsSource, /\b(ds-set-|fseg|ds-input|ds-pill)\b/)
  assert.doesNotMatch(helpSource, /\b(ds-set-|ds-btn-key)\b/)
})
