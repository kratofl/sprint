import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
const appFile = resolve(repoRoot, 'app', 'frontend', 'src', 'App.tsx')
const uiIndexFile = resolve(repoRoot, 'packages', 'ui', 'src', 'index.ts')
const uiAtomsFile = resolve(repoRoot, 'packages', 'ui', 'src', 'components', 'atoms', 'index.ts')

test('app shell uses the provided png logo asset instead of shared Sprint icon components', () => {
  const appSource = readFileSync(appFile, 'utf8')

  assert.match(appSource, /import logoIcon from ['"]@\/assets\/sprint_logo_icon\.png['"]/)
  assert.doesNotMatch(appSource, /SprintIcon/)
  assert.match(appSource, /<img src=\{logoIcon\} alt="Sprint"/)
  assert.doesNotMatch(appSource, /view === 'home' && 'border-border bg-white\/\[0\.04\]'/)
})

test('packages/ui no longer exports the old Sprint logo components', () => {
  const uiIndexSource = readFileSync(uiIndexFile, 'utf8')
  const uiAtomsSource = readFileSync(uiAtomsFile, 'utf8')

  assert.doesNotMatch(uiIndexSource, /components\/atoms/)
  assert.doesNotMatch(uiAtomsSource, /SprintLogo|SprintIcon/)
})
