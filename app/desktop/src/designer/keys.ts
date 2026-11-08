/** Input types that take typed text, where the designer's own keys (Delete, arrows, Ctrl+Z) must not act. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number'])

/** Whether a key event's target is a field the user is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type)
  return target instanceof HTMLElement && target.isContentEditable
}

/** Whether a key event comes from inside a dialog or a menu, which own their keys. */
export const isInOverlay = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null
