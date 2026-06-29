import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
const sidebarBrandFile = resolve(repoRoot, 'app', 'frontend', 'src', 'components', 'shell', 'SidebarBrand.tsx')
const uiIndexFile = resolve(repoRoot, 'packages', 'ui', 'src', 'index.ts')
const uiAtomsFile = resolve(repoRoot, 'packages', 'ui', 'src', 'components', 'atoms', 'index.ts')

test('sidebar brand uses the racing-line brand icon asset, not a letter tile or shared icon component', () => {
  const sidebarBrandSource = readFileSync(sidebarBrandFile, 'utf8')

  assert.match(sidebarBrandSource, /import sprintIconUrl from ['"]@\/assets\/brand\/sprint-icon\.svg['"]/)
  assert.match(sidebarBrandSource, /<img\s+src=\{sprintIconUrl\}/)
  // The Figma wordmark renders as text, not the shared icon components or an "S" tile.
  assert.doesNotMatch(sidebarBrandSource, /SprintIcon|SprintLogo/)
  assert.match(sidebarBrandSource, />\s*SPRINT\s*</)
})

test('packages/ui no longer exports the old Sprint logo components', () => {
  const uiIndexSource = readFileSync(uiIndexFile, 'utf8')
  const uiAtomsSource = readFileSync(uiAtomsFile, 'utf8')

  assert.doesNotMatch(uiIndexSource, /components\/atoms/)
  assert.doesNotMatch(uiAtomsSource, /SprintLogo|SprintIcon/)
})
