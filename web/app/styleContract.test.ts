import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The web design system's contract (docs/design/DESIGN.md → Web app): colours come
// only from @sprint/tokens/web.css through the Tailwind mapping in globals.css, the
// two dark blocks of the tokens agree, and the frozen sign-in styles cannot leak
// into the app.

const webRoot = fileURLToPath(new URL('..', import.meta.url))
const globals = readFileSync(join(webRoot, 'app/globals.css'), 'utf8')
const tokens = readFileSync(join(webRoot, '../packages/tokens/web.css'), 'utf8')
const signIn = readFileSync(join(webRoot, 'app/sign-in/sign-in.css'), 'utf8')

function sources(dir: string): string[] {
  return readdirSync(join(webRoot, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && ['.tsx', '.ts', '.css'].includes(extname(entry.name)))
    .filter((entry) => !entry.name.endsWith('.test.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
}

// The custom-property declarations of the first block that opens with `opener`.
function declarations(css: string, opener: string): Map<string, string> {
  const start = css.indexOf(opener)
  assert.notEqual(start, -1, `missing block ${opener}`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]))
}

test('web styles come from the web tokens and load no web fonts', () => {
  assert.match(globals, /@import ['"]@sprint\/tokens\/web\.css['"]/)
  assert.doesNotMatch(globals, /fonts\.googleapis/)
  for (const file of [...sources('app'), ...sources('components')]) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /next\/font\/google/, file)
  }
})

test('web UI code carries no hardcoded hex colours', () => {
  for (const file of [...sources('app'), ...sources('components'), ...sources('lib')]) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /#[0-9a-fA-F]{3,8}\b/, file)
  }
})

test('every colour utility maps to a web token', () => {
  // Tailwind's own palette is cleared, so only the mapped colours compile.
  assert.match(globals, /--color-\*:\s*initial/)
  const light = declarations(tokens, ':root, [data-theme="light"]')
  const mapped = [...globals.matchAll(/--color-[\w-]+:\s*var\((--[\w-]+)\)/g)].map((match) => match[1])
  assert.ok(mapped.length > 30, 'the colour mapping is missing')
  for (const token of mapped) assert.ok(light.has(token), `${token} is mapped but not defined in web.css`)
})

test('an explicit dark theme and a dark OS get the same tokens', () => {
  const explicit = declarations(tokens, '[data-theme="dark"]')
  const system = declarations(tokens, ':root:not([data-theme="light"])')
  assert.deepEqual(Object.fromEntries(system), Object.fromEntries(explicit))
  // Every themed token has a dark value: whatever light defines beyond the shared scales.
  const light = declarations(tokens, ':root, [data-theme="light"]')
  const scales = /^--(brand|green|red|yellow|blue|purple)-\d+$/
  const lightOnly = [...light.keys()].filter((name) => !scales.test(name) && !explicit.has(name))
  assert.deepEqual(lightOnly, ['--glass-blur', '--signin-glass-blur'])
})

test('the sign-in styles stay scoped to the sign-in page', () => {
  const selectors = signIn
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@[^{]+\{/g, '')
    .split('}')
    .map((rule) => rule.split('{')[0].trim())
    .filter((selector) => selector !== '' && !selector.startsWith('--'))
  assert.ok(selectors.length > 10)
  for (const group of selectors) {
    for (const selector of group.split(/,(?![^(]*\))/).map((part) => part.trim())) {
      assert.match(selector, /^(?:\[data-theme='dark'\] |:root:not\(\[data-theme='light'\]\) )?\.auth-/, selector)
    }
  }
})
