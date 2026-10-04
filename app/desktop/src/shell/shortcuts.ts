import type { Platform } from '../platform'

/** The shell-wide shortcuts App.tsx binds. `index` points into `shell/nav.ts`'s `primaryNav`. */
export type ShellShortcut = { kind: 'palette' } | { kind: 'navigate'; index: number } | { kind: 'back' }

/** The parts of a KeyboardEvent the matcher reads. */
export type ShortcutKey = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

// Physical keys, so both the digit row and the numpad work (old app:
// `TryProductionShortcutView` supported both).
const DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7']
const NUMPAD_CODES = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad7']

const digitIndex = (code: string): number => {
  const index = DIGIT_CODES.indexOf(code)
  return index >= 0 ? index : NUMPAD_CODES.indexOf(code)
}

/** Which shell shortcut a key press is on this platform, or null when it is none of them. */
export function matchShortcut(platform: Platform, event: ShortcutKey): ShellShortcut | null {
  return platform === 'mac' ? matchMac(event) : matchWindows(event)
}

// ⌘ alone, the macOS app-command modifier. Control+K is a text-editing key on macOS
// (kill to end of line) and Option+digit types a character, so neither is claimed.
function matchMac(event: ShortcutKey): ShellShortcut | null {
  if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return null
  if (event.key.toLowerCase() === 'k') return { kind: 'palette' }
  if (event.key === '[' || event.code === 'BracketLeft') return { kind: 'back' }
  const index = digitIndex(event.code)
  return index >= 0 ? { kind: 'navigate', index } : null
}

// Ctrl+K (Meta is accepted too, as before), Alt+1..7, Alt+Left — the Windows shell's bindings.
function matchWindows(event: ShortcutKey): ShellShortcut | null {
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
    return { kind: 'palette' }
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    if (event.key === 'ArrowLeft') return { kind: 'back' }
    const index = digitIndex(event.code)
    if (index >= 0) return { kind: 'navigate', index }
  }
  return null
}

/** What a tooltip, menu or help text shows for a shortcut: "Ctrl+K" / "⌘K". */
export function shortcutLabel(platform: Platform, shortcut: ShellShortcut): string {
  const mac = platform === 'mac'
  switch (shortcut.kind) {
    case 'palette':
      return mac ? '⌘K' : 'Ctrl+K'
    case 'navigate':
      return mac ? `⌘${shortcut.index + 1}` : `Alt+${shortcut.index + 1}`
    case 'back':
      return mac ? '⌘[' : 'Alt+Left'
  }
}

/** The same shortcut as an `aria-keyshortcuts` value, which spells keys by their KeyboardEvent.key names. */
export function shortcutAria(platform: Platform, shortcut: ShellShortcut): string {
  const mac = platform === 'mac'
  switch (shortcut.kind) {
    case 'palette':
      return mac ? 'Meta+K' : 'Control+K'
    case 'navigate':
      return mac ? `Meta+${shortcut.index + 1}` : `Alt+${shortcut.index + 1}`
    case 'back':
      return mac ? 'Meta+[' : 'Alt+ArrowLeft'
  }
}
