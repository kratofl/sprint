'use client'

// Navigation. On desktop a 224px sidebar runs edge to edge down the left of the
// window with a separator on its right: brand and collapse button in the top row,
// the everyday destinations without a header, then each group of tools as a
// section under a caption header that folds it away. Icons are label-secondary and
// text label; the active row sits on fill-strong in semibold with its icon in
// brand-500. Collapsing narrows it to a 56px icon rail. The sidebar is chrome
// glass (.chrome): the ambient light trails show through it. Phones get a glass tab
// bar instead.

import Link from 'next/link'
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { IconChevronDown, IconLayoutSidebar, type Icon } from '@tabler/icons-react'
import Brand from '@/components/Brand'
import { cn } from '@/lib/utils'

const COLLAPSED_KEY = 'sprint.sidebar.collapsed'
const FOLDED_KEY = 'sprint.sidebar.folded'

/** One sidebar destination. */
export type NavEntry = { href: string; label: string; icon: Icon }

/**
 * Collapsed state for the sidebar, kept per browser in localStorage. Reading
 * happens after mount so the server and client markup agree.
 */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === 'true'))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(COLLAPSED_KEY, String(next))
      return next
    })
  }, [])

  return { collapsed, toggle }
}

/** Folded sections, keyed by id ("tools"). */
export type SidebarFolds = { isOpen: (id: string) => boolean; toggle: (id: string) => void }

/**
 * Which sidebar sections are folded, kept per browser in localStorage. `currentIds`
 * are the ones holding the current page: they open on load and on every
 * navigation, so the active row is never hidden. Folding one stays possible.
 */
export function useSidebarFolds(currentIds: readonly string[]): SidebarFolds {
  const current = currentIds.join(' ')
  const [folded, setFolded] = useState<readonly string[]>([])
  const [shownFor, setShownFor] = useState(current)
  if (shownFor !== current) {
    setShownFor(current)
    setFolded((ids) => ids.filter((id) => !currentIds.includes(id)))
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored: unknown = JSON.parse(window.localStorage.getItem(FOLDED_KEY) ?? '[]')
      setFolded(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [])
      // Forces the check above on the next render, which reopens the current page's section.
      setShownFor('')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const toggle = useCallback((id: string) => {
    setFolded((ids) => {
      const next = ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]
      window.localStorage.setItem(FOLDED_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { isOpen: (id) => !folded.includes(id), toggle }
}

/**
 * The body of a section that folds: rows animate their height once
 * (grid-template-rows) and become inert while folded, so Tab skips them.
 */
function Fold({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        'grid transition-[grid-template-rows] duration-(--motion) ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="min-h-0 space-y-px overflow-hidden">{children}</div>
    </div>
  )
}

/** The sidebar column: top row, the nav rows as children, then the footer (the profile). */
export function Sidebar({
  collapsed,
  toggle,
  footer,
  children,
}: {
  collapsed: boolean
  toggle: () => void
  footer: ReactNode
  children: ReactNode
}) {
  const toggleLabel = collapsed ? 'Show sidebar' : 'Hide sidebar'
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'chrome hidden h-full shrink-0 flex-col border-r border-separator transition-[width] duration-(--motion) ease-out motion-reduce:transition-none lg:flex',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className={cn('flex h-12 shrink-0 items-center gap-2', collapsed ? 'justify-center' : 'pr-2 pl-4')}>
        {collapsed ? null : <Brand />}
        <button
          type="button"
          onClick={toggle}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          title={toggleLabel}
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-sm text-label-secondary transition-colors hover:bg-fill hover:text-label',
            !collapsed && 'ml-auto',
          )}
        >
          <IconLayoutSidebar className="size-4" />
        </button>
      </div>
      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-px overflow-x-hidden overflow-y-auto px-2 pb-2">
        {children}
      </nav>
      <div className="shrink-0 border-t border-separator p-2">{footer}</div>
    </aside>
  )
}

/**
 * A headed section. The caption header is a button that folds the section; its
 * chevron shows on hover and focus, and stays while folded. On the collapsed rail
 * the header is a gap and the section always shows.
 */
export function SidebarSection({
  collapsed,
  open,
  onToggle,
  label,
  children,
}: {
  collapsed: boolean
  open: boolean
  onToggle: () => void
  label: string
  children: ReactNode
}) {
  const bodyId = useId()
  if (collapsed) {
    return (
      <>
        <div className="h-4" aria-hidden />
        {children}
      </>
    )
  }
  return (
    <div className="group/section">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-1 rounded-sm px-2 pt-3 pb-1 text-left text-caption text-label-secondary hover:text-label"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <IconChevronDown
          aria-hidden
          className={cn(
            'size-3 shrink-0 opacity-0 transition-[transform,opacity] group-focus-within/section:opacity-100 group-hover/section:opacity-100 motion-reduce:transition-none',
            !open && '-rotate-90 opacity-100',
          )}
        />
      </button>
      <Fold id={bodyId} open={open}>
        {children}
      </Fold>
    </div>
  )
}

/** The row shape shared by links and the profile button. */
export const sidebarRowClass =
  'flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-callout font-medium text-label transition-colors hover:bg-fill [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-label-secondary'

const activeRowClass = 'bg-fill-strong font-semibold hover:bg-fill-strong [&_svg]:text-brand-500'

export function SidebarLink({ collapsed, entry, active }: { collapsed: boolean; entry: NavEntry; active: boolean }) {
  const { href, label, icon: EntryIcon } = entry
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(sidebarRowClass, collapsed && 'justify-center px-0', active && activeRowClass)}
    >
      <EntryIcon />
      <span className={cn('min-w-0 truncate', collapsed && 'hidden')}>{label}</span>
    </Link>
  )
}

/** Phone navigation: a floating glass tab bar with the top-level destinations. */
export function MobileTabBar({ entries, isActive }: { entries: readonly NavEntry[]; isActive: (href: string) => boolean }) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-20 flex items-center justify-center lg:hidden">
      <nav aria-label="Main navigation" className="glass flex max-w-[480px] min-w-0 flex-1 items-center gap-0.5 rounded-full p-1">
        {entries.map(({ href, label, icon: EntryIcon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] leading-3',
                active ? 'font-semibold text-label' : 'font-medium text-label-secondary',
              )}
            >
              <EntryIcon className={cn('size-6', active && 'text-brand-500')} />
              <span className="max-w-full truncate px-1">{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
