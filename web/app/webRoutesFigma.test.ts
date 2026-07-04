import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sources = [
  readFileSync(new URL('./page.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./sessions/page.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./engineer/page.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./setups/page.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./dash/page.tsx', import.meta.url), 'utf8'),
].join('\n')

test('web routes use Figma page, card, and numeric styling', () => {
  assert.match(sources, /space-y-\[14px\]/)
  assert.match(sources, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[14px\]/)
  assert.match(sources, /font-inter text-\[13px\] font-bold text-\[var\(--text\)\]/)
  assert.match(sources, /font-saira[^'"]*tabular-nums/)
  assert.doesNotMatch(sources, /#ff906c|#5af8fb|cyan|purple|shadow-lg|backdrop-blur|glass/)
})
