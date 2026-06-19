import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
const pageTabsFile = resolve(repoRoot, 'app', 'frontend', 'src', 'components', 'PageTabs.tsx')
const dashEditModeFile = resolve(repoRoot, 'app', 'frontend', 'src', 'components', 'DashEditMode.tsx')

test('dash editor tab bars share the flat accent active-state token', () => {
  const pageTabsSource = readFileSync(pageTabsFile, 'utf8')
  const dashEditModeSource = readFileSync(dashEditModeFile, 'utf8')

  assert.match(dashEditModeSource, /\bSegmentedControl\b/)
  assert.match(dashEditModeSource, /label="Editor view"/)
  assert.match(dashEditModeSource, /value=\{activeEditorView\}/)
  assert.match(dashEditModeSource, /onChange=\{view => handleSelectEditorView\(view as 'layout' \| 'alerts' \| 'settings'\)\}/)
  assert.doesNotMatch(dashEditModeSource, /\bfseg\b/)

  assert.doesNotMatch(pageTabsSource, /border-warning/)
  assert.doesNotMatch(pageTabsSource, /border-text-muted/)
  assert.doesNotMatch(pageTabsSource, /border-primary text-foreground bg-white\/\[0\.04\]/)

  assert.match(pageTabsSource, /tabsTriggerActiveClassName/)
})
