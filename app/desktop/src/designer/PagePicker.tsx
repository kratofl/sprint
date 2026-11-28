import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Layers, Moon, Plus } from 'lucide-react'
import type { DashLayout, DashPage } from '@sprint/dashboard'
import type { DashMode } from '../bridge'
import { MenuLayer, Popover, type MenuAnchor } from '../shell/Menu'
import { addIdlePage, addPage } from '../views/DashesDomain'
import { movePage } from './layoutOps'
import { SESSIONS, showsEverywhere } from './pageModes'
import type { Mutate } from './useDesignerDoc'
import '../views/CarPicker.css'

type Apply = (mutate: Mutate, group?: string) => boolean

/** Where a page shows, in words: "Every session", "Qualifying, Race", or the idle page's place. */
export function pageShowsIn(page: DashPage, isIdle: boolean, modes: readonly DashMode[]): string {
  if (isIdle) return 'Menus and garage'
  if (showsEverywhere(page)) return 'Every session'
  const names = new Map<string, string>([...SESSIONS.map((session): [string, string] => [session.id, session.label]), ...modes.map((mode): [string, string] => [mode.id, mode.name])])
  return (page.showIn ?? []).map((id) => names.get(id) ?? id).join(', ')
}

/**
 * The top of the Layout section's explorer: the page being designed, where it shows, and a new
 * page (+: a page or the idle page). The picker opens every page as a list, the idle page first:
 * pick one, or step a page up or down to change the order the wheel cycles them in. Renaming,
 * where it shows, clearing and deleting are the page's own panel (PageInspector.tsx).
 */
export function PagePicker({
  layout,
  pageId,
  onSelectPage,
  apply,
  modes,
}: {
  layout: DashLayout
  pageId: string
  onSelectPage: (pageId: string) => void
  apply: Apply
  modes: readonly DashMode[]
}) {
  const pickerRef = useRef<HTMLButtonElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [list, setList] = useState<{ left: number; top: number; width: number } | null>(null)
  const [addMenu, setAddMenu] = useState<MenuAnchor | null>(null)
  const pages: DashPage[] = layout.idlePage ? [layout.idlePage, ...layout.pages] : layout.pages
  const page = pages.find((candidate) => candidate.id === pageId) ?? pages[0]
  if (!page) return null
  const isIdle = (candidate: DashPage) => candidate.id === layout.idlePage?.id
  const index = layout.pages.findIndex((candidate) => candidate.id === page.id)
  const position = isIdle(page) ? 'Idle page' : `Page ${index + 1} of ${layout.pages.length}`

  const closeList = () => {
    setList(null)
    pickerRef.current?.focus()
  }
  const pick = (id: string) => {
    onSelectPage(id)
    closeList()
  }
  // Moving a row moves its DOM node, which drops the focus; it goes back to the button pressed, or
  // to the row when that button is now off (the page reached the top or the bottom).
  const move = (id: string, by: -1 | 1) => {
    if (!apply((current) => movePage(current, id, by))) return
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(id)}"]`)
      const button = row?.querySelector<HTMLButtonElement>(by < 0 ? '[data-move="up"]' : '[data-move="down"]')
      const target = button && !button.disabled ? button : row?.querySelector<HTMLElement>('.designer-page-row-pick')
      target?.focus()
    })
  }
  const closeAdd = () => {
    setAddMenu(null)
    addRef.current?.focus()
  }

  return (
    <div className="designer-page-picker">
      <button
        ref={pickerRef}
        type="button"
        className="car-picker"
        aria-haspopup="dialog"
        aria-expanded={list !== null}
        onClick={() => {
          const box = pickerRef.current?.getBoundingClientRect()
          if (box) setList({ left: box.left, top: box.bottom + 4, width: Math.max(box.width + 36, 300) })
        }}
      >
        {isIdle(page) ? <Moon className="designer-page-picker-icon" aria-hidden="true" /> : <Layers className="designer-page-picker-icon" aria-hidden="true" />}
        <span className="car-picker-text">
          <span className="car-picker-name">{page.name}</span>
          <span className="car-picker-line">
            {position} · {pageShowsIn(page, isIdle(page), modes)}
          </span>
        </span>
        <ChevronDown className="car-picker-chevron" aria-hidden="true" />
      </button>
      <button
        ref={addRef}
        type="button"
        className="icon-button"
        aria-label="Add page"
        title="Add page"
        aria-haspopup="menu"
        onClick={() => {
          const box = addRef.current?.getBoundingClientRect()
          if (box) setAddMenu({ x: box.left, y: box.bottom + 4 })
        }}
      >
        <Plus size={16} />
      </button>

      {list && (
        <Popover label="Pages" className="designer-page-list" style={{ left: list.left, top: list.top, width: list.width }} onClose={closeList}>
          <div ref={listRef} role="list" aria-label="Pages">
            {pages.map((candidate) => {
              const at = layout.pages.findIndex((entry) => entry.id === candidate.id)
              return (
                <div key={candidate.id} role="listitem" data-page-id={candidate.id} className={candidate.id === page.id ? 'list-row designer-page-row selected' : 'list-row designer-page-row'}>
                  <button
                    type="button"
                    aria-current={candidate.id === page.id ? 'page' : undefined}
                    className="designer-page-row-pick"
                    autoFocus={candidate.id === page.id}
                    onClick={() => pick(candidate.id)}
                  >
                    {isIdle(candidate) && <Moon className="designer-page-row-icon" aria-hidden="true" />}
                    <span className="car-picker-text">
                      <span className="car-picker-name">{candidate.name}</span>
                      <span className="car-picker-line">{pageShowsIn(candidate, isIdle(candidate), modes)}</span>
                    </span>
                  </button>
                  {!isIdle(candidate) && (
                    <>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Move ${candidate.name} up`}
                        title="Move up"
                        data-move="up"
                        disabled={at <= 0}
                        onClick={() => move(candidate.id, -1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Move ${candidate.name} down`}
                        title="Move down"
                        data-move="down"
                        disabled={at >= layout.pages.length - 1}
                        onClick={() => move(candidate.id, 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </Popover>
      )}

      {addMenu && (
        <MenuLayer anchor={addMenu} label="Add page" width={200} onClose={closeAdd}>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setAddMenu(null)
              const result = addPage(layout, 'Page')
              if (apply(() => result.layout)) onSelectPage(result.page.id)
            }}
          >
            <Plus />
            <span className="menu-item-label">Page</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={Boolean(layout.idlePage)}
            onClick={() => {
              setAddMenu(null)
              const result = addIdlePage(layout)
              if (result?.idlePage && apply(() => result)) onSelectPage(result.idlePage.id)
            }}
          >
            <Moon />
            <span className="menu-item-label">Idle page</span>
          </button>
        </MenuLayer>
      )}
    </div>
  )
}
