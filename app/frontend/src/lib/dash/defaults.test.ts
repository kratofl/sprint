import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..', '..')
const defaultsFile = resolve(repoRoot, 'app', 'frontend', 'src', 'lib', 'dash', 'defaults.ts')

test('dash editor fallback defaults align with the shared global color tokens', () => {
  const defaultsSource = readFileSync(defaultsFile, 'utf8')

  assert.match(defaultsSource, /primary:\s*\{\s*R:\s*255,\s*G:\s*144,\s*B:\s*108,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /accent:\s*\{\s*R:\s*90,\s*G:\s*248,\s*B:\s*251,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /fg:\s*\{\s*R:\s*255,\s*G:\s*255,\s*B:\s*255,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /muted:\s*\{\s*R:\s*128,\s*G:\s*128,\s*B:\s*128,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /muted2:\s*\{\s*R:\s*161,\s*G:\s*161,\s*B:\s*170,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /success:\s*\{\s*R:\s*52,\s*G:\s*211,\s*B:\s*153,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /warning:\s*\{\s*R:\s*251,\s*G:\s*191,\s*B:\s*36,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /danger:\s*\{\s*R:\s*248,\s*G:\s*113,\s*B:\s*113,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /surface:\s*\{\s*R:\s*20,\s*G:\s*20,\s*B:\s*20,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /bg:\s*\{\s*R:\s*10,\s*G:\s*10,\s*B:\s*10,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /border:\s*\{\s*R:\s*42,\s*G:\s*42,\s*B:\s*42,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /tc:\s*\{\s*R:\s*90,\s*G:\s*248,\s*B:\s*251,\s*A:\s*255\s*\}/)
  assert.match(defaultsSource, /motor:\s*\{\s*R:\s*255,\s*G:\s*144,\s*B:\s*108,\s*A:\s*255\s*\}/)
})
