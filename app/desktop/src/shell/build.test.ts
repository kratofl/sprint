import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeBuild } from './build'

test('a dev run is a development build whatever version the host reports', () => {
  assert.deepEqual(describeBuild(true, 'feat/x', '0.1.0'), { kind: 'development', branch: 'feat/x' })
})

test('a packaged version with a suffix is a pre-release, a plain one is stable', () => {
  assert.deepEqual(describeBuild(false, null, '0.2.1-alpha.1'), { kind: 'pre-release', version: '0.2.1-alpha.1' })
  assert.deepEqual(describeBuild(false, null, '1.0.0'), { kind: 'stable', version: '1.0.0' })
})

test('a packaged build shows nothing until its version is known', () => {
  assert.equal(describeBuild(false, null, null), null)
})
