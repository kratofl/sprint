"use client"

import * as React from "react"
import { cn } from "../../lib/utils"

export interface NavRailItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
}

export interface NavRailSection {
  label: string
  items: NavRailItem[]
  pinned?: "top" | "bottom"
}

export interface NavRailProps {
  items?: NavRailItem[]
  sections?: NavRailSection[]
  activeId: string
  onSelect: (id: string) => void
  /** Slot rendered at the very top (e.g. app wordmark) */
  header?: React.ReactNode
  /** Slot rendered at the bottom below pinned sections. */
  footer?: React.ReactNode
  className?: string
}

export function NavRail({
  items = [],
  sections,
  activeId,
  onSelect,
  header,
  footer,
  className,
}: NavRailProps) {
  const resolvedSections = sections ?? [{ label: "Navigation", items }]
  const topSections = resolvedSections.filter((section) => section.pinned !== "bottom")
  const bottomSections = resolvedSections.filter((section) => section.pinned === "bottom")

  function renderSection(section: NavRailSection) {
    return (
      <div key={section.label} className="flex flex-col gap-[6px]">
        <div className="px-[6px] font-saira text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
          {section.label}
        </div>
        <div className="flex flex-col gap-1">
          {section.items.map((item) => {
            const isActive = item.id === activeId
            const Icon = item.icon

            return (
              <button
                key={item.id}
                data-slot="nav-rail-item"
                data-active={isActive}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "group flex h-8 w-full items-center gap-[10px] rounded-control border px-[10px] py-2 text-left font-inter text-[13px] font-medium transition-colors outline-none focus-visible:border-[var(--orange)] focus-visible:ring-0",
                  isActive
                    ? "border-[var(--orange)] bg-[var(--panel-3)] text-[var(--orange)]"
                    : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-[var(--orange)]" : "text-[var(--muted)] group-hover:text-[var(--text)]"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <aside
      data-slot="nav-rail"
      className={cn("flex h-full w-full flex-col justify-between gap-[14px]", className)}
    >
      <div className="flex min-h-0 flex-col gap-[14px]">
        {header}
        <nav className="flex min-h-0 flex-col gap-[14px] overflow-hidden">
          {topSections.map(renderSection)}
        </nav>
      </div>
      <div className="flex flex-col gap-[14px]">
        {bottomSections.map(renderSection)}
        {footer}
      </div>
    </aside>
  )
}
