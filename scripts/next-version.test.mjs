import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bumpFor, nextTag, releasedAtHead } from './next-version.mjs'

const history = ['v0.1.2-alpha.5', 'v0.2.1-alpha.1', 'v1.0.0', 'not-a-release']

test('a pre-release opens the next line, then counts up', () => {
  assert.equal(nextTag(history, 'pre-release', 'patch'), 'v1.0.1-beta.1')
  assert.equal(nextTag([...history, 'v1.0.1-beta.1'], 'pre-release', 'patch'), 'v1.0.1-beta.2')
  assert.equal(nextTag([...history, 'v1.1.0-beta.1'], 'pre-release', 'minor'), 'v1.1.0-beta.2')
})

test('stable promotes the open pre-release line, or bumps from the last stable', () => {
  assert.equal(nextTag([...history, 'v1.0.1-beta.2'], 'stable', 'patch'), 'v1.0.1')
  assert.equal(nextTag(history, 'stable', 'patch'), 'v1.0.1')
  assert.equal(nextTag(history, 'stable', 'minor'), 'v1.1.0')
  assert.equal(nextTag(history, 'stable', 'major'), 'v2.0.0')
})

test('refuses a tag that would not be the newest release', () => {
  assert.throws(() => nextTag([...history, 'v1.1.0-beta.1'], 'pre-release', 'patch'), /not be newer than v1\.1\.0-beta\.1/)
  assert.throws(() => nextTag([...history, 'v1.1.0-beta.1'], 'stable', 'patch'), /not be newer/)
})

test('the first release of a repo without tags', () => {
  assert.equal(nextTag([], 'pre-release', 'minor'), 'v0.1.0-beta.1')
})

test('the biggest label among the merged PRs picks the bump', () => {
  assert.equal(bumpFor([]), 'patch')
  assert.equal(bumpFor([['dependencies'], ['type/bug']]), 'patch')
  assert.equal(bumpFor([['type/bug'], ['type/feature']]), 'minor')
  assert.equal(bumpFor([['type/feature'], ['type/breaking']]), 'major')
})

test('a released commit is not released again, but its beta can be promoted', () => {
  assert.equal(releasedAtHead(['v1.0.1-beta.1'], 'pre-release'), 'v1.0.1-beta.1')
  assert.equal(releasedAtHead(['v1.0.1-beta.1'], 'stable'), null)
  assert.equal(releasedAtHead(['v1.0.1-beta.1', 'v1.0.1'], 'stable'), 'v1.0.1')
  assert.equal(releasedAtHead(['not-a-release'], 'pre-release'), null)
})
