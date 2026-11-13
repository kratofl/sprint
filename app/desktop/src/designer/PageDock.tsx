import { useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { ArrowLeft, ArrowRight, Eraser, Eye, Grid2x2, Moon, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { dashPreviewStates, type DashLayout, type DashPage, type DashPreviewState } from '@sprint/dashboard'
import { MenuLayer, type MenuAnchor } from '../shell/Menu'
import { addIdlePage, addPage, clearPage, deletePage, removeIdlePage, renamePage } from '../views/DashesDomain'
import { movePage } from './layoutOps'
import type { Mutate } from './useDesignerDoc'

type Apply = (mutate: Mutate, group?: string) => boolean

type DockMenu = { kind: 'page'; pageId: string; anchor: MenuAnchor } | { kind: 'add'; anchor: MenuAnchor }

/**
 * The dock at the bottom of the stage: the pages (idle page first) to switch between, their
 * actions (rename, move, clear, delete — the ⋯ or a right-click), a new page, the one primary
 * action "Widget" that opens the library, what the dash shows meanwhile (live or a sample
 * state), and the grid.
 */
export function PageDock({
  layout,
  pageId,
  onSelectPage,
  apply,
  libraryOpen,
  onToggleLibrary,
  previewState,
  onPreviewState,
  showGrid,
  onToggleGrid,
}: {
  layout: DashLayout
  pageId: string
  onSelectPage: (pageId: string) => void
  apply: Apply
  libraryOpen: boolean
  onToggleLibrary: () => void
  previewState: DashPreviewState
  onPreviewState: (state: DashPreviewState) => void
  showGrid: boolean
  onToggleGrid: () => void
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

  // Left/Right move between the pages (WAI-ARIA tabs pattern).
  const onPagesKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    if (event.target instanceof HTMLInputElement) return
    event.preventDefault()
    const index = pages.findIndex((page) => page.id === pageId)
    const next = pages[(index + (event.key === 'ArrowRight' ? 1 : pages.length - 1)) % pages.length]
    if (!next) return
    onSelectPage(next.id)
    event.currentTarget.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(next.id)}"]`)?.focus()
  }

  const menuPage = menu?.kind === 'page' ? (pages.find((page) => page.id === menu.pageId) ?? null) : null
  const menuPageIsIdle = menuPage !== null && menuPage.id === layout.idlePage?.id
  const menuPageIndex = menuPage ? layout.pages.findIndex((page) => page.id === menuPage.id) : -1

  // The menus are siblings of the dock, not inside it: its transform and blur would make it the
  // menus' containing block instead of the window.
  return (
    <>
      <div className="designer-glass designer-dock">
        <div className="designer-pages" role="tablist" aria-label="Pages" onKeyDown={onPagesKeyDown}>
          {pages.map((page) => {
            const selected = page.id === pageId
            const isIdle = page.id === layout.idlePage?.id
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
                className="designer-page"
                title={isIdle ? 'Shown while you are in the menus or the garage' : undefined}
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
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Page actions"
          title="Rename, move or delete this page"
          aria-haspopup="menu"
          onClick={(event) => setMenu({ kind: 'page', pageId, anchor: anchorAbove(event, pageId === layout.idlePage?.id ? 120 : 190) })}
        >
          <MoreHorizontal size={16} />
        </button>
        <button type="button" className="icon-button" aria-label="Add page" title="Add page" aria-haspopup="menu" onClick={(event) => setMenu({ kind: 'add', anchor: anchorAbove(event, 80) })}>
          <Plus size={16} />
        </button>

        <span className="designer-dock-sep" aria-hidden="true" />
        <button type="button" className="button primary" aria-expanded={libraryOpen} onClick={onToggleLibrary}>
          <Plus /> Widget
        </button>
        <span className="designer-dock-sep" aria-hidden="true" />

        <label className="designer-preview" title="What the dash shows while you design">
          <Eye size={14} aria-hidden="true" />
          <select
            aria-label="Preview"
            value={previewState}
            onChange={(event) => {
              const match = dashPreviewStates.find((option) => option.state === event.target.value)
              if (match) onPreviewState(match.state)
            }}
          >
            {dashPreviewStates.map((option) => (
              <option key={option.state} value={option.state}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="icon-button designer-toggle" aria-label="Grid" title="Show the grid" aria-pressed={showGrid} onClick={onToggleGrid}>
          <Grid2x2 size={16} />
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
