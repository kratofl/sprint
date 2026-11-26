import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AppView } from '../bridge'
import { areaOf, hasExplorer, navItemFor } from './nav'

/** The explorer's body, which the page's list renders into; null while there is none (hidden, or not mounted yet). */
export const ExplorerContext = createContext<HTMLElement | null>(null)

/**
 * Whether the page's list shows in the explorer. While it does not (hidden, or a window without
 * one), the page shows its own ways around instead: "All sessions" back links, a Mine | Shared switch.
 */
export const useExplorerShown = (): boolean => useContext(ExplorerContext) !== null

/**
 * A page's list in the explorer, left of the page: what `children` is goes there, through a portal
 * into the shell's explorer (`ExplorerPane`). Renders nothing while the explorer is hidden, so a
 * page keeps its own way to every item too (`useExplorerShown`).
 *
 *   <Explorer label="Sessions">
 *     <ExplorerRow selected={…} title="All sessions" onClick={…} />
 *     <ExplorerGroup title="Open" count={2} />
 *     …
 *   </Explorer>
 */
export function Explorer({ label, children }: { label: string; children: ReactNode }) {
  const slot = useContext(ExplorerContext)
  if (!slot) return null
  return createPortal(
    <div className="explorer-list" role="navigation" aria-label={label}>
      {children}
    </div>,
    slot,
  )
}

/**
 * The explorer column (App.tsx): the area's pages as tabs, then the body the page fills. Only
 * for a page with an explorer (`hasExplorer`); a one-page area (Settings) names its page instead.
 */
export function ExplorerPane({ view, onSelect, bodyRef }: { view: AppView; onSelect: (view: AppView) => void; bodyRef: (element: HTMLElement | null) => void }) {
  const area = areaOf(view)
  if (!hasExplorer(view)) return null
  return (
    <aside className="explorer" aria-label={`${area.label} pages`}>
      {area.views.length > 1 ? (
        // The area's pages, a switch between pages rather than tabs over one panel: so a nav of links.
        <nav className="explorer-head explorer-tabs" aria-label={area.label}>
          {area.views.map((page) => (
            <button
              key={page}
              type="button"
              className="explorer-tab"
              aria-current={page === view ? 'page' : undefined}
              onClick={() => onSelect(page)}
            >
              {navItemFor(page)?.tab ?? page}
            </button>
          ))}
        </nav>
      ) : (
        <div className="explorer-head">
          <span className="explorer-title">{navItemFor(view)?.label ?? view}</span>
        </div>
      )}
      <div ref={bodyRef} className="explorer-body" />
    </aside>
  )
}

/**
 * Which groups of a list are open (an explorer's circuits): the one holding the open item, and any
 * the driver opened, until the driver closes it. Opening an item in a group the driver opened
 * keeps it open.
 */
export function useExpandedGroups(current: string | null): { isOpen: (id: string) => boolean; toggle: (id: string) => void } {
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const isOpen = (id: string) => !closed.has(id) && (opened.has(id) || id === current)
  const toggle = (id: string) => {
    const open = isOpen(id)
    const without = (set: ReadonlySet<string>) => new Set([...set].filter((entry) => entry !== id))
    setOpened(open ? without(opened) : new Set([...opened, id]))
    setClosed(open ? new Set([...closed, id]) : without(closed))
  }
  return { isOpen, toggle }
}

/** A quiet heading over a run of rows, with how many there are. */
export function ExplorerGroup({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="explorer-group">
      <span>{title}</span>
      {count !== undefined && <span className="tabular">{count}</span>}
    </h3>
  )
}

/**
 * One row: `lead` (a logo, a flag, a chip) before the title, an optional second line, and `meta`
 * at the end (a time, a count, a status). `expanded` draws the disclosure chevron of a row that opens
 * rows under it; `depth` indents a row under such a row.
 */
export function ExplorerRow({
  title,
  line,
  lead,
  meta,
  selected = false,
  expanded,
  depth = 0,
  disabled = false,
  tooltip,
  onClick,
}: {
  title: ReactNode
  line?: ReactNode
  lead?: ReactNode
  meta?: ReactNode
  selected?: boolean
  expanded?: boolean
  depth?: number
  disabled?: boolean
  tooltip?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={selected ? 'list-row explorer-row selected' : 'list-row explorer-row'}
      data-depth={depth}
      aria-current={selected ? 'true' : undefined}
      aria-expanded={expanded}
      disabled={disabled}
      title={tooltip}
      onClick={onClick}
    >
      {expanded === undefined ? null : expanded ? <ChevronDown className="explorer-chevron" /> : <ChevronRight className="explorer-chevron" />}
      {lead}
      <span className="explorer-row-text">
        <span className="explorer-row-title">{title}</span>
        {line !== undefined && <span className="explorer-row-line">{line}</span>}
      </span>
      {meta !== undefined && <span className="explorer-row-meta tabular">{meta}</span>}
    </button>
  )
}
