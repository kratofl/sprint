import { useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { ArrowLeft, ArrowRight, Eraser, Layers, Moon, MoreHorizontal, Pencil, Plus, Timer, Trash2 } from 'lucide-react'
import type { DashLayout, DashPage } from '@sprint/dashboard'
import { MenuLayer, type MenuAnchor } from '../shell/Menu'
import { addIdlePage, addPage, clearPage, deletePage, removeIdlePage, renamePage } from '../views/DashesDomain'
import type { DashMode } from '../bridge'
import { movePage } from './layoutOps'
import { cycledPages, SESSIONS } from './pageModes'
import type { Mutate } from './useDesignerDoc'

type Apply = (mutate: Mutate, group?: string) => boolean

type DockMenu = { kind: 'page'; pageId: string; anchor: MenuAnchor } | { kind: 'add'; anchor: MenuAnchor }

/**
 * The dock at the bottom of the stage: "Pages in" — which pages the wheel cycles in a session or
 * one of the driver's modes, the others struck through — the pages (idle page first) to switch between, their
 * actions (rename, move, clear, delete — the ⋯ or a right-click) and a new page; after the pages,
 * set apart, the dash's lap review (`reviewing` while it is on the stage). How the dash is shown
 * is the toolbar's (`ViewTools`).
 */
export function PageDock({
  layout,
  pageId,
  onSelectPage,
  reviewing,
  onReview,
  apply,
  cyclePreview,
  onCyclePreview,
  modes,
}: {
  layout: DashLayout
  pageId: string
  onSelectPage: (pageId: string) => void
  reviewing: boolean
  onReview: () => void
  apply: Apply
  /** `all`, a session id or a mode id. */
  cyclePreview: string
  onCyclePreview: (preview: string) => void
  modes: readonly DashMode[]
}) {
  const [menu, setMenu] = useState<DockMenu | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const menuOrigin = useRef<HTMLElement | null>(null)
  const pages: DashPage[] = layout.idlePage ? [layout.idlePage, ...layout.pages] : layout.pages

  const closeMenu = (): void => {
    setMenu(null)
    menuOrigin.current?.focus()
  }

  /** Menus open above the dock, from the control (or the pointer, for a right-click). */
  const anchorAbove = (event: ReactMouseEvent<HTMLElement>, height: number): MenuAnchor => {
    menuOrigin.current = event.currentTarget
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX > 0 || event.clientY > 0 ? event.clientX : box.left
    return { x, y: box.top - height - 8 }
  }

  const run = (action: () => void) => () => {
    setMenu(null)
    action()
  }

  // Left/Right move between the pages and the lap review after them (WAI-ARIA tabs pattern).
  const onPagesKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    if (event.target instanceof HTMLInputElement) return
    event.preventDefault()
    const stops = [...pages.map((page) => page.id), null]
    const index = reviewing ? stops.length - 1 : stops.indexOf(pageId)
    const next = stops[(index + (event.key === 'ArrowRight' ? 1 : stops.length - 1)) % stops.length]
    if (next === undefined) return
    if (next === null) onReview()
    else onSelectPage(next)
    event.currentTarget.querySelector<HTMLElement>(next === null ? '[data-lap-review]' : `[data-page-id="${CSS.escape(next)}"]`)?.focus()
  }

  const menuPage = menu?.kind === 'page' ? (pages.find((page) => page.id === menu.pageId) ?? null) : null
  const menuPageIsIdle = menuPage !== null && menuPage.id === layout.idlePage?.id
  const menuPageIndex = menuPage ? layout.pages.findIndex((page) => page.id === menuPage.id) : -1

  // The menus are siblings of the dock, not inside it: its transform and blur would make it the
  // menus' containing block instead of the window.
  return (
    <>
      <div className="designer-glass designer-dock">
        <label className="designer-preview designer-cycle-preview" title="Which pages the wheel cycles in a session or one of your modes">
          <Layers size={14} aria-hidden="true" />
          <select aria-label="Pages in" value={cyclePreview} onChange={(event) => onCyclePreview(event.target.value)}>
            <option value="all">All pages</option>
            <optgroup label="Sessions">
              {SESSIONS.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.label}
                </option>
              ))}
            </optgroup>
            {modes.length > 0 && (
              <optgroup label="Your modes">
                {modes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <span className="designer-dock-sep" aria-hidden="true" />
        <div className="designer-pages" role="tablist" aria-label="Pages" onKeyDown={onPagesKeyDown}>
          {pages.map((page) => {
            const cycled = cycledPages(layout.pages, cyclePreview)
            const selected = !reviewing && page.id === pageId
            const isIdle = page.id === layout.idlePage?.id
            const skipped = !isIdle && !cycled.has(page.id)
            if (renaming === page.id) {
              return (
                <input
                  key={page.id}
                  className="designer-page-rename"
                  aria-label="Page name"
                  defaultValue={page.name}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setRenaming(null)
                    }
                  }}
                  onBlur={(event) => {
                    const name = event.target.value
                    setRenaming(null)
                    apply((current) => (name.trim() === page.name ? null : renamePage(current, page.id, name)))
                  }}
                />
              )
            }
            return (
              <button
                key={page.id}
                type="button"
                role="tab"
                data-page-id={page.id}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={skipped ? 'designer-page is-skipped' : 'designer-page'}
                title={isIdle ? 'Shown while you are in the menus or the garage' : skipped ? 'The wheel does not cycle this page there' : undefined}
                onClick={() => onSelectPage(page.id)}
                onDoubleClick={() => setRenaming(page.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onSelectPage(page.id)
                  setMenu({ kind: 'page', pageId: page.id, anchor: anchorAbove(event, isIdle ? 120 : 190) })
                }}
              >
                {isIdle && <Moon size={13} aria-hidden="true" />}
                {page.name}
              </button>
            )
          })}
          <span className="designer-dock-sep" aria-hidden="true" />
          <button
            type="button"
            role="tab"
            data-lap-review
            aria-selected={reviewing}
            tabIndex={reviewing ? 0 : -1}
            className="designer-page"
            title="What the dash shows after each timed lap"
            onClick={onReview}
          >
            <Timer size={13} aria-hidden="true" />
            Lap review
          </button>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Page actions"
          disabled={reviewing}
          title="Rename, move or delete this page"
          aria-haspopup="menu"
          onClick={(event) => setMenu({ kind: 'page', pageId, anchor: anchorAbove(event, pageId === layout.idlePage?.id ? 120 : 190) })}
        >
          <MoreHorizontal size={16} />
        </button>
        <button type="button" className="icon-button" aria-label="Add page" title="Add page" aria-haspopup="menu" onClick={(event) => setMenu({ kind: 'add', anchor: anchorAbove(event, 80) })}>
          <Plus size={16} />
        </button>

      </div>

      {menu?.kind === 'add' && (
        <MenuLayer anchor={menu.anchor} label="Add page" width={200} onClose={closeMenu}>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => {
              const result = addPage(layout, 'Page')
              if (!apply(() => result.layout)) return
              onSelectPage(result.page.id)
              setRenaming(result.page.id)
            })}
          >
            <Plus />
            <span className="menu-item-label">Page</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={Boolean(layout.idlePage)}
            onClick={run(() => {
              const result = addIdlePage(layout)
              if (result?.idlePage && apply(() => result)) onSelectPage(result.idlePage.id)
            })}
          >
            <Moon />
            <span className="menu-item-label">Idle page</span>
          </button>
        </MenuLayer>
      )}

      {menuPage && (
        <MenuLayer anchor={menu?.anchor ?? { x: 0, y: 0 }} label={`${menuPage.name} actions`} width={200} onClose={closeMenu}>
          <button type="button" role="menuitem" className="menu-item" onClick={run(() => setRenaming(menuPage.id))}>
            <Pencil />
            <span className="menu-item-label">Rename</span>
          </button>
          {!menuPageIsIdle && (
            <>
              <button type="button" role="menuitem" className="menu-item" disabled={menuPageIndex <= 0} onClick={run(() => apply((current) => movePage(current, menuPage.id, -1)))}>
                <ArrowLeft />
                <span className="menu-item-label">Move left</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={menuPageIndex >= layout.pages.length - 1}
                onClick={run(() => apply((current) => movePage(current, menuPage.id, 1)))}
              >
                <ArrowRight />
                <span className="menu-item-label">Move right</span>
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={menuPage.widgets.length === 0 && (menuPage.groups ?? []).length === 0}
            onClick={run(() => apply((current) => clearPage(current, menuPage.id)))}
          >
            <Eraser />
            <span className="menu-item-label">Clear page</span>
          </button>
          <div className="menu-separator" role="separator" />
          {menuPageIsIdle ? (
            <button type="button" role="menuitem" className="menu-item destructive" onClick={run(() => apply((current) => removeIdlePage(current)))}>
              <Trash2 />
              <span className="menu-item-label">Remove idle page</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="menu-item destructive"
              disabled={layout.pages.length <= 1}
              title={layout.pages.length <= 1 ? 'A dash keeps at least one page.' : undefined}
              onClick={run(() => apply((current) => deletePage(current, menuPage.id)))}
            >
              <Trash2 />
              <span className="menu-item-label">Delete page</span>
            </button>
          )}
        </MenuLayer>
      )}
    </>
  )
}
