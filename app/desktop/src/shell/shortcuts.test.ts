import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchShortcut, shortcutAria, shortcutLabel, type ShortcutKey } from './shortcuts'

const key = (overrides: Partial<ShortcutKey>): ShortcutKey => ({
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
})

test('windows: Ctrl+K opens the palette, Alt+1..7 (digit row or numpad) navigate, Alt+Left goes back', () => {
  assert.deepEqual(matchShortcut('windows', key({ ctrlKey: true, key: 'k', code: 'KeyK' })), { kind: 'palette' })
  assert.deepEqual(matchShortcut('windows', key({ ctrlKey: true, key: 'K', code: 'KeyK' })), { kind: 'palette' })
  assert.deepEqual(matchShortcut('windows', key({ altKey: true, key: '1', code: 'Digit1' })), { kind: 'navigate', index: 0 })
  assert.deepEqual(matchShortcut('windows', key({ altKey: true, key: '7', code: 'Numpad7' })), { kind: 'navigate', index: 6 })
  assert.deepEqual(matchShortcut('windows', key({ altKey: true, key: 'ArrowLeft', code: 'ArrowLeft' })), { kind: 'back' })
})

test('mac: ⌘K opens the palette, ⌘1..7 (digit row or numpad) navigate, ⌘[ goes back', () => {
  assert.deepEqual(matchShortcut('mac', key({ metaKey: true, key: 'k', code: 'KeyK' })), { kind: 'palette' })
  assert.deepEqual(matchShortcut('mac', key({ metaKey: true, key: '1', code: 'Digit1' })), { kind: 'navigate', index: 0 })
  assert.deepEqual(matchShortcut('mac', key({ metaKey: true, key: '7', code: 'Numpad7' })), { kind: 'navigate', index: 6 })
  assert.deepEqual(matchShortcut('mac', key({ metaKey: true, key: '[', code: 'BracketLeft' })), { kind: 'back' })
})

test('mac ignores the Windows bindings: Ctrl+K stays a text-field key, Option+digit types a character', () => {
  assert.equal(matchShortcut('mac', key({ ctrlKey: true, key: 'k', code: 'KeyK' })), null)
  assert.equal(matchShortcut('mac', key({ altKey: true, key: '¡', code: 'Digit1' })), null)
  assert.equal(matchShortcut('mac', key({ altKey: true, key: 'ArrowLeft', code: 'ArrowLeft' })), null)
})

test('windows ignores ⌘-style bindings and shifted variants', () => {
  assert.equal(matchShortcut('windows', key({ ctrlKey: true, key: '1', code: 'Digit1' })), null)
  assert.equal(matchShortcut('windows', key({ ctrlKey: true, key: '[', code: 'BracketLeft' })), null)
  assert.equal(matchShortcut('windows', key({ ctrlKey: true, shiftKey: true, key: 'K', code: 'KeyK' })), null)
  assert.equal(matchShortcut('mac', key({ metaKey: true, shiftKey: true, key: '1', code: 'Digit1' })), null)
})

test('labels use each platform\'s own notation', () => {
  assert.equal(shortcutLabel('windows', { kind: 'palette' }), 'Ctrl+K')
  assert.equal(shortcutLabel('windows', { kind: 'navigate', index: 2 }), 'Alt+3')
  assert.equal(shortcutLabel('windows', { kind: 'back' }), 'Alt+Left')
  assert.equal(shortcutLabel('mac', { kind: 'palette' }), '⌘K')
  assert.equal(shortcutLabel('mac', { kind: 'navigate', index: 2 }), '⌘3')
  assert.equal(shortcutLabel('mac', { kind: 'back' }), '⌘[')
})

test('aria-keyshortcuts values name the modifier keys the way ARIA spells them', () => {
  assert.equal(shortcutAria('windows', { kind: 'palette' }), 'Control+K')
  assert.equal(shortcutAria('windows', { kind: 'back' }), 'Alt+ArrowLeft')
  assert.equal(shortcutAria('mac', { kind: 'palette' }), 'Meta+K')
  assert.equal(shortcutAria('mac', { kind: 'back' }), 'Meta+[')
})
