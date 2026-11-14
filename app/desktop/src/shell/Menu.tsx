import { useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'

// The app's floating layers: a menu (MenuFlyout of `.menu-item`s) and a popover (a flyout holding
// its own controls, such as a search and a list). Both sit on a transparent full-window layer that
// catches the outside click; Escape closes them and `onClose` returns focus to whatever raised them.

/** Where a menu opens: at the pointer, or under the control that raised it. */
export type MenuAnchor = { x: number; y: number }

/** A flyout's enabled items, in order. */
export const enabledItems = (root: HTMLElement | null): HTMLButtonElement[] => [...(root?.querySelectorAll<HTMLButtonElement>(':scope > .menu-item:not(:disabled)') ?? [])]

/** Up/Down move between a flyout's items, wrapping; true when the key was one of them. */
export function moveFocus(root: HTMLElement | null, key: string): boolean {
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return false
  const items = enabledItems(root)
  const index = items.findIndex((item) => item === document.activeElement)
  const next = key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
  items[next]?.focus()
  return true
}

/** The full-window layer under a flyout: a press outside it, or a right-click, closes it. */
function Layer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="menu-layer"
      onPointerDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      {children}
    </div>
  )
}

/**
 * A menu: it takes focus on its first item, Up/Down move between items, Escape and Tab close it.
 * Kept inside the window by `width`.
 */
export function MenuLayer({
  anchor,
  label,
  width,
  onClose,
  children,
  beside,
}: {
  anchor: MenuAnchor
  label: string
  width: number
  onClose: () => void
  children: ReactNode
  /** A submenu, drawn on the same layer (not inside the flyout, whose blur would pin it there). */
  beside?: ReactNode
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    enabledItems(menuRef.current)[0]?.focus()
  }, [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      onClose()
    } else if (moveFocus(menuRef.current, event.key)) {
      event.preventDefault()
    }
  }

  return (
    <Layer onClose={onClose}>
      <div
        ref={menuRef}
        className="menu-flyout"
        role="menu"
        aria-label={label}
        style={{ left: Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(anchor.y, window.innerHeight - 200)), width }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
      {beside}
    </Layer>
  )
}

/**
 * A popover: a flyout of its own controls (it focuses what it marks `autoFocus`). Escape closes
 * it; every other key goes to `onKeyDown`. The caller places it with `style`.
 */
export function Popover({
  label,
  className,
  style,
  onClose,
  onKeyDown,
  children,
}: {
  label: string
  className?: string
  style: CSSProperties
  onClose: () => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  children: ReactNode
}) {
  return (
    <Layer onClose={onClose}>
      <div
        className={className ? `menu-flyout ${className}` : 'menu-flyout'}
        role="dialog"
        aria-label={label}
        style={style}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else {
            onKeyDown?.(event)
          }
        }}
      >
        {children}
      </div>
    </Layer>
  )
}
