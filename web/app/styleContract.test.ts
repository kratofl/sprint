import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = fileURLToPath(new URL('..', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(join(webRoot, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && ['.tsx', '.ts', '.css'].includes(extname(entry.name)))
    .filter((entry) => !entry.name.endsWith('.test.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
}

test('web styles come from the web CI tokens and load no web fonts', () => {
  const globals = readFileSync(join(webRoot, 'app/globals.css'), 'utf8')
  assert.match(globals, /@import ['"]@sprint\/tokens\/web\.css['"]/)
  assert.doesNotMatch(globals, /fonts\.googleapis/)
})

test('web UI code carries no hardcoded hex colours', () => {
  for (const file of [...sources('app'), ...sources('components')]) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /#[0-9a-fA-F]{3,8}\b/, file)
  }
})
