import assert from 'node:assert/strict'
import { test } from 'node:test'
import { primaryNav } from './nav'

test('each sidebar group is one run of pages, so its heading shows once', () => {
  const runs = primaryNav.map((item) => item.group).filter((group, index, all) => group !== undefined && group !== all[index - 1])
  assert.deepEqual(runs, [...new Set(runs)])
})
