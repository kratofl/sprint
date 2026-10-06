import test from 'node:test'
import assert from 'node:assert/strict'
import { appearanceStyle, parsePreferences, preferencesCookie, themeAttribute } from './preferences.ts'

test('a browser without the cookie gets the system theme, 220 ms motion and the toolbar-token glass', () => {
  assert.deepEqual(parsePreferences(undefined), { theme: 'system', motion: 220, glass: 72 })
})

test('saved preferences survive the cookie round trip', () => {
  const cookie = preferencesCookie({ theme: 'dark', motion: 300, glass: 40 })

  assert.equal(cookie, 'sprint_prefs=theme=dark&motion=300&glass=40; Path=/; Max-Age=31536000; SameSite=Lax')
  assert.deepEqual(parsePreferences('theme=dark&motion=300&glass=40'), { theme: 'dark', motion: 300, glass: 40 })
})

test('out-of-range values are clamped to the slider ends', () => {
  assert.deepEqual(parsePreferences('theme=light&motion=9000&glass=0'), { theme: 'light', motion: 600, glass: 15 })
  assert.deepEqual(parsePreferences('theme=light&motion=-5&glass=500'), { theme: 'light', motion: 0, glass: 100 })
})

test('a garbled field falls back to its own default and keeps the others', () => {
  assert.deepEqual(parsePreferences('theme=sepia&motion=fast&glass=55.6'), { theme: 'system', motion: 220, glass: 56 })
  assert.deepEqual(parsePreferences('motion=Infinity'), { theme: 'system', motion: 220, glass: 72 })
  assert.deepEqual(parsePreferences('%%%'), { theme: 'system', motion: 220, glass: 72 })
})

test('motion becomes one duration and glass becomes the chrome fill and blur', () => {
  assert.deepEqual(appearanceStyle({ theme: 'system', motion: 220, glass: 72 }), {
    '--motion': '220ms',
    '--chrome-opacity': '72%',
    '--chrome-backdrop': 'blur(20px) saturate(180%)',
  })
  assert.deepEqual(appearanceStyle({ theme: 'dark', motion: 0, glass: 15 }), {
    '--motion': '0ms',
    '--chrome-opacity': '15%',
    '--chrome-backdrop': 'blur(4px) saturate(180%)',
  })
  assert.deepEqual(appearanceStyle({ theme: 'light', motion: 600, glass: 100 }), {
    '--motion': '600ms',
    '--chrome-opacity': '100%',
    // Fully tinted glass shows nothing behind it, so it skips the blur altogether.
    '--chrome-backdrop': 'none',
  })
})

test('only an explicit theme pins data-theme; system leaves it to the OS', () => {
  assert.equal(themeAttribute('system'), undefined)
  assert.equal(themeAttribute('dark'), 'dark')
  assert.equal(themeAttribute('light'), 'light')
})
