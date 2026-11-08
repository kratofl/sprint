import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Check, ChevronRight, Copy, Folder, Pencil, Plus, Trash2 } from 'lucide-react'
import type { DashCategoryLists } from '../bridge'

/** Where a menu opens: at the pointer, or under the control that raised it. */
export type MenuAnchor = { x: number; y: number }

const MENU_WIDTH = 228
const SUBMENU_WIDTH = 200

const enabledItems = (root: HTMLElement | null): HTMLButtonElement[] => [...(root?.querySelectorAll<HTMLButtonElement>(':scope > .menu-item:not(:disabled)') ?? [])]

/** Up/Down move between a flyout's items, wrapping; true when the key was one of them. */
function moveFocus(root: HTMLElement | null, key: string): boolean {
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return false
  const items = enabledItems(root)
  const index = items.findIndex((item) => item === document.activeElement)
  const next = key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
  items[next]?.focus()
  return true
}

/**
 * A MenuFlyout on a transparent layer that catches the outside click. It takes focus on its first
 * item; Escape and Tab close it (`onClose` returns focus to whatever raised it). The dash designer
 * builds its menus on it too.
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
    <div
      className="dashes-menu-layer"
      onPointerDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        ref={menuRef}
        className="menu-flyout dashes-menu"
        role="menu"
        aria-label={label}
        style={{ left: Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(anchor.y, window.innerHeight - 200)), width }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
      {beside}
    </div>
  )
}

/**
 * One dash's menu (its ⋯, a right-click, Shift+F10): Edit, Duplicate, the Category submenu, and
 * Delete last. In the submenu the dash's own category carries a check; picking it again takes
 * the dash out of it, back to Other.
 */
export function DashMenu({
  anchor,
  dashName,
  category,
  categories,
  onClose,
  onEdit,
  onDuplicate,
  onSetCategory,
  onNewCategory,
  onDelete,
}: {
  anchor: MenuAnchor
  dashName: string
  /** The dash's category, or null for Other. */
  category: string | null
  categories: DashCategoryLists
  onClose: () => void
  onEdit: () => void
  onDuplicate: () => void
  onSetCategory: (category: string | null) => void
  onNewCategory: () => void
  onDelete: () => void
}) {
  const [submenuAt, setSubmenuAt] = useState<{ x: number; y: number; focus: boolean } | null>(null)
  const categoryItem = useRef<HTMLButtonElement | null>(null)
  const submenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (submenuAt?.focus) enabledItems(submenuRef.current)[0]?.focus()
  }, [submenuAt])

  const run = (action: () => void) => () => {
    onClose()
    action()
  }

  // The submenu opens beside the Category item, on the left when the right would leave the window.
  const openSubmenu = (focus: boolean): void => {
    const item = categoryItem.current?.getBoundingClientRect()
    if (!item) return
    const right = item.right + 6
    setSubmenuAt({ x: right + SUBMENU_WIDTH > window.innerWidth - 8 ? item.left - SUBMENU_WIDTH - 6 : right, y: item.top - 4, focus })
  }

  const closeSubmenu = (): void => {
    setSubmenuAt(null)
    categoryItem.current?.focus()
  }

  const onSubmenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeSubmenu()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      onClose()
    } else {
      event.stopPropagation()
      if (moveFocus(submenuRef.current, event.key)) event.preventDefault()
    }
  }

  const categoryOption = (name: string) => (
    <button
      key={name}
      type="button"
      role="menuitemradio"
      aria-checked={category === name}
      className="menu-item"
      onClick={run(() => onSetCategory(category === name ? null : name))}
    >
      <span className="menu-item-label">{name}</span>
      {category === name && <Check className="dashes-menu-check" />}
    </button>
  )

  const submenu = submenuAt && (
    <div
      ref={submenuRef}
      className="menu-flyout dashes-menu"
      role="menu"
      aria-label="Category"
      style={{ left: submenuAt.x, top: Math.max(8, Math.min(submenuAt.y, window.innerHeight - 280)), width: SUBMENU_WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={onSubmenuKeyDown}
    >
      {categories.builtIn.map(categoryOption)}
      <div className="menu-separator" role="separator" />
      {categories.custom.length > 0 && (
        <>
          {categories.custom.map(categoryOption)}
          <div className="menu-separator" role="separator" />
        </>
      )}
      <button type="button" role="menuitem" className="menu-item" onClick={run(onNewCategory)}>
        <Plus />
        <span className="menu-item-label">New category…</span>
      </button>
    </div>
  )

  return (
    <MenuLayer
      anchor={anchor}
      label={`${dashName} actions`}
      width={MENU_WIDTH}
      onClose={onClose}
      beside={submenu}
    >
      <button type="button" role="menuitem" className="menu-item" onClick={run(onEdit)} onPointerEnter={() => setSubmenuAt(null)}>
        <Pencil />
        <span className="menu-item-label">Edit</span>
        <span className="menu-item-shortcut">Enter</span>
      </button>
      <button type="button" role="menuitem" className="menu-item" onClick={run(onDuplicate)} onPointerEnter={() => setSubmenuAt(null)}>
        <Copy />
        <span className="menu-item-label">Duplicate</span>
      </button>
      <button
        ref={categoryItem}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={submenuAt !== null}
        className={submenuAt ? 'menu-item selected' : 'menu-item'}
        onPointerEnter={() => openSubmenu(false)}
        onClick={() => openSubmenu(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openSubmenu(true)
          }
        }}
      >
        <Folder />
        <span className="menu-item-label">Category</span>
        <ChevronRight />
      </button>
      <div className="menu-separator" role="separator" />
      <button type="button" role="menuitem" className="menu-item destructive" onClick={run(onDelete)} onPointerEnter={() => setSubmenuAt(null)}>
        <Trash2 />
        <span className="menu-item-label">Delete</span>
        <span className="menu-item-shortcut">Del</span>
      </button>
    </MenuLayer>
  )
}

/** A custom category's ⋯ beside its heading: Rename and Delete. */
export function CategoryMenu({ anchor, name, onClose, onRename, onDelete }: { anchor: MenuAnchor; name: string; onClose: () => void; onRename: () => void; onDelete: () => void }) {
  const run = (action: () => void) => () => {
    onClose()
    action()
  }
  return (
    <MenuLayer anchor={anchor} label={`${name} actions`} width={200} onClose={onClose}>
      <button type="button" role="menuitem" className="menu-item" onClick={run(onRename)}>
        <Pencil />
        <span className="menu-item-label">Rename…</span>
      </button>
      <div className="menu-separator" role="separator" />
      <button type="button" role="menuitem" className="menu-item destructive" onClick={run(onDelete)}>
        <Trash2 />
        <span className="menu-item-label">Delete…</span>
      </button>
    </MenuLayer>
  )
}
