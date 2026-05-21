import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
const pageTabsFile = resolve(repoRoot, 'app', 'frontend', 'src', 'components', 'PageTabs.tsx')
const dashEditModeFile = resolve(repoRoot, 'app', 'frontend', 'src', 'components', 'DashEditMode.tsx')

test('dash editor tab bars share the same sidebar-style accent active-state token', () => {
  const pageTabsSource = readFileSync(pageTabsFile, 'utf8')
  const dashEditModeSource = readFileSync(dashEditModeFile, 'utf8')

  assert.match(dashEditModeSource, /editorTab === 'designer'[\s\S]*border-accent text-accent bg-accent\/\[0\.06\]/)
  assert.match(dashEditModeSource, /editorTab === 'settings'[\s\S]*border-accent text-accent bg-accent\/\[0\.06\]/)

  assert.doesNotMatch(pageTabsSource, /border-warning/)
  assert.doesNotMatch(pageTabsSource, /border-text-muted/)
  assert.doesNotMatch(pageTabsSource, /border-primary text-foreground bg-white\/\[0\.04\]/)

  const accentActiveMatches = pageTabsSource.match(/border-accent text-accent bg-accent\/\[0\.06\]/g) ?? []
  assert.ok(accentActiveMatches.length >= 3, 'expected accent active state for idle, alerts, and normal pages')
})
