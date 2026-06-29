"use client"

import * as React from "react"
import { cn } from "../../lib/utils"

export interface NavRailItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
}

export interface NavRailSection {
  label?: string
  items: NavRailItem[]
  pinned?: "top" | "bottom"
}

export interface NavRailProps {
  items?: NavRailItem[]
  sections?: NavRailSection[]
  activeId: string
  onSelect: (id: string) => void
  collapsed?: boolean
  /** Slot rendered at the very top (e.g. app wordmark + collapse control). */
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
  collapsed = false,
  header,
  footer,
  className,
}: NavRailProps) {
  const resolvedSections = sections ?? [{ label: "Navigation", items }]
  const topSections = resolvedSections.filter((section) => section.pinned !== "bottom")
  const bottomSections = resolvedSections.filter((section) => section.pinned === "bottom")

  function renderSection(section: NavRailSection) {
    const sectionKey = section.label ?? section.items.map((item) => item.id).join("|")

    return (
      <div key={sectionKey} className="flex flex-col gap-1">
        {section.label && !collapsed && (
          // Figma "Section" overline: Inter Bold 10, uppercase, Text/Subtle.
          <div className="px-[6px] pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text3)]">
            {section.label}
          </div>
        )}
        {section.label && collapsed && (
          <div className="mx-[8px] my-1 h-px rounded-full bg-[var(--line)]" aria-hidden="true" />
        )}
        <div className="flex flex-col gap-[2px]">
          {section.items.map((item) => {
            const isActive = item.id === activeId
            const Icon = item.icon

            return (
              <button
                type="button"
                key={item.id}
                data-slot="nav-rail-item"
                aria-current={isActive ? "page" : undefined}
                data-active={isActive}
                title={collapsed ? item.label : undefined}
                onClick={() => onSelect(item.id)}
                className={cn(
                  // Figma "Navigation Item": h32, pad 8×10, gap 10, Inter Medium 13;
                  // default Text/Muted radius pill, selected bg Surface/Tile2 radius 18 + accent.
                  "group relative flex h-[32px] w-full items-center gap-[10px] rounded-[999px] px-[10px] text-left text-[13px] font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
                  collapsed && "justify-center gap-0 px-0",
                  isActive
                    ? "rounded-[18px] bg-[var(--panel3)] text-[var(--accent)]"
                    : "text-[var(--text2)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-[var(--accent)]" : "text-[var(--text3)] group-hover:text-[var(--text)]"
                  )}
                />
                <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
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
      className={cn("flex h-full w-full flex-col gap-[14px]", className)}
    >
      {header}
      {/* Nav groups: top groups flush to logo, pinned (bottom) groups pushed down. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto">
        {topSections.map(renderSection)}
      </nav>
      <div className="flex flex-col gap-[14px]">
        {bottomSections.map(renderSection)}
        {footer}
      </div>
    </aside>
  )
}
