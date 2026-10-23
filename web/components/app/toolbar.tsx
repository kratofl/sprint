'use client'

// The frosted toolbar: one uniform band across the top of the content area, 48px
// tall (64px on phones), sticky, with content scrolling underneath. The shell
// renders the band; pages fill it with PageHeader, which portals into the slots
// below, so a page declares its toolbar where it renders and its handlers stay live.
//
// Slot order (DESIGN.md → Web app → Toolbar): title · scope (a PeriodStepper or
// segmented control) · caption — then, trailing, the icon actions · the page's
// search · the page's one primary action, last. When the band runs out of room the
// caption truncates first, then the title. On phones the caption is hidden and the
// scope moves to a second row of the band. Once content has scrolled under it, the
// band lifts to shadow-e2.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SlotName = 'title' | 'scope' | 'caption' | 'actions' | 'search' | 'primary'
type Slots = Record<SlotName, HTMLElement | null>

const ToolbarSlots = createContext<Slots>({ title: null, scope: null, caption: null, actions: null, search: null, primary: null })

export function ToolbarFrame({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<HTMLElement | null>(null)
  const [scope, setScope] = useState<HTMLElement | null>(null)
  const [caption, setCaption] = useState<HTMLElement | null>(null)
  const [actions, setActions] = useState<HTMLElement | null>(null)
  const [search, setSearch] = useState<HTMLElement | null>(null)
  const [primary, setPrimary] = useState<HTMLElement | null>(null)
  const { ref: sentinel, past: stuck } = useScrolledPast()
  return (
    <ToolbarSlots.Provider value={{ title, scope, caption, actions, search, primary }}>
      {/* 1px sentinel above the band (its margin cancels the height): out of view means content scrolled under. */}
      <div ref={sentinel} aria-hidden className="-mb-px h-px" />
      <header
        role="toolbar"
        aria-label="Toolbar"
        className={cn(
          'toolbar-band sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 px-5 transition-shadow duration-(--motion) motion-reduce:transition-none max-lg:h-auto max-lg:min-h-16 max-lg:flex-wrap max-lg:content-center max-lg:gap-y-2 max-lg:py-2.5',
          stuck && 'shadow-(--shadow-e2)',
        )}
      >
        {/* Shrinks after the caption: the title truncates once the caption is gone. */}
        <div ref={setTitle} className="flex min-w-0 shrink items-center" />
        <div ref={setScope} className="flex shrink-0 items-center empty:hidden max-lg:order-last max-lg:basis-full" />
        <div ref={setCaption} className="flex min-w-0 shrink-[1000] items-center empty:hidden max-lg:hidden" />
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div ref={setActions} className="flex items-center gap-2.5 empty:hidden" />
          <div ref={setSearch} className="flex items-center empty:hidden" />
          <div ref={setPrimary} className="flex items-center empty:hidden" />
        </div>
      </header>
      {children}
    </ToolbarSlots.Provider>
  )
}

/**
 * Whether the element given to `ref` has left the viewport, i.e. its scroll
 * container has scrolled past it. One IntersectionObserver, no scroll handler.
 */
function useScrolledPast() {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [past, setPast] = useState(false)
  useEffect(() => {
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setPast(entry ? !entry.isIntersecting : false))
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return { ref: setNode, past }
}

/** The page's one primary action: a primary M button on desktop, a 44px icon button on phones. */
export type ToolbarPrimaryAction = { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }

export type ToolbarContentProps = {
  title: string
  scope?: ReactNode
  caption?: string
  actions?: ReactNode
  search?: ReactNode
  primaryAction?: ToolbarPrimaryAction
}

/** Puts a page's title, scope, caption, actions, search and primary action into the toolbar the shell renders. */
export function ToolbarContent({ title, scope, caption, actions, search, primaryAction }: ToolbarContentProps) {
  const slots = useContext(ToolbarSlots)
  return (
    <>
      {slots.title ? createPortal(<h1 className="truncate text-title-2">{title}</h1>, slots.title) : null}
      {scope && slots.scope ? createPortal(scope, slots.scope) : null}
      {caption && slots.caption
        ? createPortal(<span className="truncate text-footnote text-label-secondary">{caption}</span>, slots.caption)
        : null}
      {actions && slots.actions ? createPortal(actions, slots.actions) : null}
      {search && slots.search ? createPortal(search, slots.search) : null}
      {primaryAction && slots.primary ? createPortal(<PrimaryButton {...primaryAction} />, slots.primary) : null}
    </>
  )
}

function PrimaryButton({ label, icon, onClick, disabled }: ToolbarPrimaryAction) {
  return (
    <>
      <Button onClick={onClick} disabled={disabled} className="max-lg:hidden">
        {icon}
        {label}
      </Button>
      <Button onClick={onClick} disabled={disabled} size="icon" aria-label={label} title={label} className="lg:hidden [&_svg]:size-5">
        {icon}
      </Button>
    </>
  )
}

/** The fill that groups borderless icon actions; a pill on phones. */
export function ToolbarGroup({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5 rounded-md bg-toolbar-fill p-0.5 max-lg:rounded-full">{children}</div>
}

/**
 * A toolbar action. With an icon it is a borderless symbol and the label becomes
 * its accessible name and tooltip; put it in a ToolbarGroup. Without an icon it
 * is a text-labelled action on the toolbar fill, standing on its own.
 */
export function ToolbarButton({ label, icon, onClick, disabled }: { label: string; icon?: ReactNode; onClick: () => void; disabled?: boolean }) {
  if (icon) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={disabled}
        className="grid size-7 place-items-center rounded-sm text-label transition-colors hover:bg-toolbar-fill disabled:text-label-disabled max-lg:size-11 max-lg:rounded-full [&_svg]:size-4 max-lg:[&_svg]:size-[18px]"
      >
        {icon}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-7 rounded-sm bg-toolbar-fill px-3 text-callout font-semibold whitespace-nowrap text-label transition-colors disabled:text-label-disabled max-lg:h-11 max-lg:rounded-full max-lg:px-4"
    >
      {label}
    </button>
  )
}
