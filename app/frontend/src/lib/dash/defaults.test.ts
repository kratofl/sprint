import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..', '..')
const defaultsFile = resolve(repoRoot, 'app', 'frontend', 'src', 'lib', 'dash', 'defaults.ts')

test('dash editor fallback defaults align with the shared global color tokens', () => {
  const defaultsSource = readFileSync(defaultsFile, 'utf8')

  assert.match(defaultsSource, /primary:\s*\{\s*R:\s*255,\s*G:\s*144,\s*B:\s*108,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /accent:\s*\{\s*R:\s*79,\s*G:\s*156,\s*B:\s*255,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /fg:\s*\{\s*R:\s*246,\s*G:\s*240,\s*B:\s*230,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /muted:\s*\{\s*R:\s*169,\s*G:\s*160,\s*B:\s*149,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /muted2:\s*\{\s*R:\s*200,\s*G:\s*191,\s*B:\s*178,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /success:\s*\{\s*R:\s*52,\s*G:\s*211,\s*B:\s*153,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /warning:\s*\{\s*R:\s*251,\s*G:\s*191,\s*B:\s*36,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /danger:\s*\{\s*R:\s*255,\s*G:\s*59,\s*B:\s*48,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /surface:\s*\{\s*R:\s*18,\s*G:\s*17,\s*B:\s*15,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /bg:\s*\{\s*R:\s*9,\s*G:\s*9,\s*B:\s*7,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /border:\s*\{\s*R:\s*111,\s*G:\s*103,\s*B:\s*95,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /tc:\s*\{\s*R:\s*79,\s*G:\s*156,\s*B:\s*255,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /motor:\s*\{\s*R:\s*255,\s*G:\s*144,\s*B:\s*108,\s*A:\s*255\s*\}/)
})
