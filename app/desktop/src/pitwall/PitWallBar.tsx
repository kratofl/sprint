import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Copy, ExternalLink, LayoutDashboard, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { LiveLink } from '../bridge'
import { ContentDialog } from '../shell/ContentDialog'
import { MenuLayer } from '../shell/Menu'
import { Status, type StatusTone } from '../shell/Status'
import { MAX_PAGE_NAME, MAX_PAGES } from './layoutOps'
import type { PitWallLayout } from './pitWallData'
import type { TileData } from './tileFrame'
import { carName, carNumber, playerOf } from './timing'

export type PageAction = 'detach' | 'rename' | 'duplicate' | 'delete'

/** The wall's own bar (tabs, Edit layout, Close), or a page's or tile's window's (its name and the way back). */
type BarMode = { kind: 'main'; editing: boolean } | { kind: 'own'; title: string; onBack: () => void }

/** The link in a word for the bar: linked with its round trip, reconnecting, or not linked. */
function linkPill(link: LiveLink): { tone: StatusTone; label: string } {
  if (link.phase === 'Connected') return { tone: 'success', label: link.health.roundTripMs !== null ? `Linked · ${link.health.roundTripMs} ms` : 'Linked' }
  if (link.phase === 'Interrupted') return { tone: 'warning', label: 'Reconnecting' }
  return { tone: 'neutral', label: 'Not linked' }
}

/**
 * The bar over every pit wall window; it is the window's title bar (it drags the window and
 * leaves room for the OS caption buttons). On the wall: page tabs (a page in its own window is
 * marked ↗ and brings that window forward), + to add a page, a menu per page (right-click, ⋯,
 * Shift+F10), the car followed, the link, Edit layout and Close. In Edit layout: Cancel and Done.
 */
export function PitWallBar({
  mode,
  layout,
  shownPageId,
  link,
  data,
  onChoose,
  onAddPage,
  onPageAction,
  onEdit,
  onCancelEdit,
  onDoneEdit,
  onClose,
}: {
  mode: BarMode
  layout: PitWallLayout
  shownPageId: string | null
  link: LiveLink
  data: TileData
  onChoose?: (pageId: string) => void
  onAddPage?: () => void
  onPageAction?: (action: PageAction, pageId: string) => void
  onEdit?: () => void
  onCancelEdit?: () => void
  onDoneEdit?: () => void
  onClose?: () => void
}) {
  const [menu, setMenu] = useState<{ pageId: string; x: number; y: number } | null>(null)
  const player = data.pitWall ? playerOf(data.pitWall.field) : null
  const pill = linkPill(link)
  const editing = mode.kind === 'main' && mode.editing

  const openMenu = (pageId: string, element: HTMLElement) => {
    const box = element.getBoundingClientRect()
    setMenu({ pageId, x: box.left, y: box.bottom + 4 })
  }

  // Left/Right move along the tabs (WAI-ARIA tabs); Shift+F10 or the menu key opens a tab's menu.
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, pageId: string) => {
    if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
      event.preventDefault()
      openMenu(pageId, event.currentTarget)
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const tabs = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])]
    const at = tabs.indexOf(event.currentTarget)
    tabs[(at + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]?.focus()
  }

  return (
    <div className="pw-bar">
      {mode.kind === 'main' ? (
        <>
          <span className="pw-bar-title">Pit wall</span>
          <div className="pw-pages" role="tablist" aria-label="Pages">
            {layout.pages.map((page) => (
              <button
                key={page.id}
                type="button"
                role="tab"
                aria-selected={page.id === shownPageId}
                tabIndex={page.id === shownPageId ? 0 : -1}
                className={page.detached ? 'pw-page away' : 'pw-page'}
                title={page.detached ? 'In its own window: bring it to the front' : undefined}
                onClick={() => onChoose?.(page.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ pageId: page.id, x: event.clientX, y: event.clientY })
                }}
                onKeyDown={(event) => onTabKey(event, page.id)}
              >
                {page.name}
                {page.detached && <ExternalLink size={11} aria-label="in its own window" />}
              </button>
            ))}
            {shownPageId && (
              <button
                type="button"
                className="pw-page icon"
                aria-label="Page menu"
                title="Page menu"
                aria-haspopup="menu"
                onClick={(event) => openMenu(shownPageId, event.currentTarget)}
              >
                <MoreHorizontal size={14} />
              </button>
            )}
            <button type="button" className="pw-page icon" aria-label="Add a page" title="Add a page" disabled={layout.pages.length >= MAX_PAGES} onClick={onAddPage}>
              <Plus size={14} />
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="pw-bar-title">Pit wall · {mode.title}</span>
          <span className="muted pw-own-hint">its own window</span>
        </>
      )}
      {editing ? (
        <span className="muted pw-bar-hint">Drag a tile by its handle, resize it from its corner, drop it on another tile to stack them.</span>
      ) : (
        player && (
          <span className="pw-who">
            <b>
              #{carNumber(player)} · {player.driver}
            </b>
            <span className="muted">{carName(player)}</span>
          </span>
        )
      )}
      <span className="pw-bar-right">
        {mode.kind === 'own' ? (
          <button type="button" className="button subtle" onClick={mode.onBack}>
            Back into the pit wall
          </button>
        ) : editing ? (
          <>
            <button type="button" className="button subtle" onClick={onCancelEdit}>
              Cancel
            </button>
            <button type="button" className="button primary" onClick={onDoneEdit}>
              <Check /> Done
            </button>
          </>
        ) : (
          <>
            <span className="pw-linkpill">
              <Status tone={pill.tone} quiet>
                {pill.label}
              </Status>
            </span>
            <button type="button" className="button subtle" onClick={onEdit}>
              <LayoutDashboard /> Edit layout
            </button>
            <button type="button" className="button subtle" onClick={onClose}>
              <X /> Close
            </button>
          </>
        )}
      </span>
      {menu && onPageAction && (
        <PageMenu
          x={menu.x}
          y={menu.y}
          canDetach={!editing && !layout.pages.find((page) => page.id === menu.pageId)?.detached}
          canDuplicate={layout.pages.length < MAX_PAGES}
          canDelete={layout.pages.length > 1}
          onAction={(action) => {
            setMenu(null)
            onPageAction(action, menu.pageId)
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

/** A page's menu, at the tab: most used first, Delete last in danger text. Arrow keys move, Escape closes. */
function PageMenu({
  x,
  y,
  canDetach,
  canDuplicate,
  canDelete,
  onAction,
  onClose,
}: {
  x: number
  y: number
  canDetach: boolean
  canDuplicate: boolean
  canDelete: boolean
  onAction: (action: PageAction) => void
  onClose: () => void
}) {
  return (
    <MenuLayer anchor={{ x, y }} label="Page" width={240} onClose={onClose}>
      <button type="button" role="menuitem" className="menu-item" disabled={!canDetach} onClick={() => onAction('detach')}>
        <ExternalLink />
        <span className="menu-item-label">Open in its own window</span>
      </button>
      <button type="button" role="menuitem" className="menu-item" onClick={() => onAction('rename')}>
        <Pencil />
        <span className="menu-item-label">Rename</span>
      </button>
      <button type="button" role="menuitem" className="menu-item" disabled={!canDuplicate} onClick={() => onAction('duplicate')}>
        <Copy />
        <span className="menu-item-label">Duplicate</span>
      </button>
      <div className="menu-separator" role="separator" />
      <button type="button" role="menuitem" className="menu-item destructive" disabled={!canDelete} onClick={() => onAction('delete')}>
        <Trash2 />
        <span className="menu-item-label">Delete page</span>
      </button>
    </MenuLayer>
  )
}

/** Renames a page: 1 to 40 characters; Enter saves. */
export function RenameDialog({ name, onRename, onCancel }: { name: string; onRename: (name: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(name)
  const id = useId()
  const clean = draft.trim()
  const valid = clean.length >= 1 && clean.length <= MAX_PAGE_NAME
  return (
    <ContentDialog
      title="Rename page"
      onCancel={onCancel}
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) onRename(clean)
      }}
      footer={
        <>
          <button type="submit" className="button primary" disabled={!valid}>
            Rename
          </button>
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor={id}>Name</label>
        <input id={id} value={draft} maxLength={MAX_PAGE_NAME} autoFocus onFocus={(event) => event.target.select()} onChange={(event) => setDraft(event.target.value)} />
      </div>
    </ContentDialog>
  )
}
