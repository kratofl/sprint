import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const dashEditModeSource = read('./DashEditMode.tsx')
const pageTabsSource = read('./PageTabs.tsx')
const widgetPropertiesSource = read('./WidgetProperties.tsx')
const alertsEditorSource = read('./AlertsEditor.tsx')
const additionalSettingsPanelSource = read('./AdditionalSettingsPanel.tsx')

test('editor property panels render reusable field controls through @sprint/ui', () => {
  for (const [name, source] of [
    ['WidgetProperties', widgetPropertiesSource],
    ['AlertsEditor', alertsEditorSource],
  ] as const) {
    for (const primitive of ['Input', 'Select', 'SelectTrigger', 'SelectItem', 'Stepper', 'Button']) {
      assert.match(source, new RegExp(`\\b${primitive}\\b`), `${name} should use shared ${primitive}`)
    }

    assert.doesNotMatch(source, /<select\b/, `${name} should not render native selects directly`)
    assert.doesNotMatch(source, /<input\b(?![^>]*type="color")/, `${name} should not render native text/number inputs directly`)
    assert.doesNotMatch(source, /\binspectorInputClassName\b/, `${name} should not own shared input chrome`)
  }
})

test('page tabs use shared controls for inline page actions without legacy shell navigation', () => {
  for (const primitive of ['Button', 'IconButton', 'Input']) {
    assert.match(pageTabsSource, new RegExp(`\\b${primitive}\\b`), `PageTabs should use shared ${primitive}`)
  }

  assert.doesNotMatch(pageTabsSource, /ShellView|ShellPageTabs|SHELL_TABS/)
  assert.doesNotMatch(pageTabsSource, /Dash Editor/)
  assert.doesNotMatch(pageTabsSource, /<input\b/, 'PageTabs should not render raw rename inputs')
  assert.doesNotMatch(pageTabsSource, /\bds-pb-card\b|\bds-pb-add\b/, 'PageTabs should not own page-bar button chrome')
})

test('dash editor top-level chrome uses shared controls instead of local control classes', () => {
  for (const primitive of ['Input', 'IconButton', 'SegmentedControl', 'SettingsCard']) {
    assert.match(dashEditModeSource, new RegExp(`\\b${primitive}\\b`), `DashEditMode should use shared ${primitive}`)
  }

  assert.doesNotMatch(dashEditModeSource, /\bfseg\b|\bicobtn\b|\bds-input\b|\bds-set-card\b|\bds-pill\b/)
})

test('additional settings panel uses shared visible controls for color and numeric settings', () => {
  for (const primitive of ['Button', 'IconButton', 'Input', 'SegmentedControl', 'Stepper']) {
    assert.match(additionalSettingsPanelSource, new RegExp(`\\b${primitive}\\b`), `AdditionalSettingsPanel should use shared ${primitive}`)
  }

  assert.doesNotMatch(additionalSettingsPanelSource, /<input\b(?![^>]*type="color")/, 'visible settings inputs should use shared Input or Stepper')
  assert.doesNotMatch(additionalSettingsPanelSource, /border-border-input|bg-bg-panel|focus:ring-accent/)
})
