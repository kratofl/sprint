import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
const appFile = resolve(repoRoot, 'app', 'frontend', 'src', 'App.tsx')
const uiIndexFile = resolve(repoRoot, 'packages', 'ui', 'src', 'index.ts')
const uiAtomsFile = resolve(repoRoot, 'packages', 'ui', 'src', 'components', 'atoms', 'index.ts')

test('app titlebar uses the racing-line brand icon asset, not a letter tile or shared icon component', () => {
  const appSource = readFileSync(appFile, 'utf8')

  assert.match(appSource, /import sprintIconUrl from ['"]@\/assets\/brand\/sprint-icon\.svg['"]/)
  assert.match(appSource, /<img src=\{sprintIconUrl\} alt="Sprint"/)
  // Not the shared icon components, not the old hardcoded "S" letter tile.
  assert.doesNotMatch(appSource, /SprintIcon|SprintLogo/)
  assert.doesNotMatch(appSource, /font-space text-\[13px\] font-bold/)
})

test('packages/ui no longer exports the old Sprint logo components', () => {
  const uiIndexSource = readFileSync(uiIndexFile, 'utf8')
  const uiAtomsSource = readFileSync(uiAtomsFile, 'utf8')

  assert.doesNotMatch(uiIndexSource, /components\/atoms/)
  assert.doesNotMatch(uiAtomsSource, /SprintLogo|SprintIcon/)
})
