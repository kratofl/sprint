import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dashListSource = readFileSync(
  new URL('./DashList.tsx', import.meta.url),
  'utf8',
)

test('dash list rows expose row-level edit activation', () => {
  assert.match(dashListSource, /role="button"/)
  assert.match(dashListSource, /tabIndex=\{0\}/)
  assert.match(dashListSource, /onClick=\{openEditor\}/)
  assert.match(dashListSource, /onKeyDown=\{\(event\) => \{/)
  assert.match(dashListSource, /event\.target !== event\.currentTarget/)
  assert.match(dashListSource, /event\.key === 'Enter' \|\| event\.key === ' '/)
})

test('dash list action buttons stop row edit bubbling', () => {
  assert.match(dashListSource, /event\.stopPropagation\(\);\s*onEdit\(layout\.id\)/)
  assert.match(dashListSource, /event\.stopPropagation\(\);\s*void onSetDefault\(layout\.id\)/)
  assert.match(dashListSource, /event\.stopPropagation\(\);\s*if \(!isBuiltIn\) setConfirmOpen\(true\)/)
})
