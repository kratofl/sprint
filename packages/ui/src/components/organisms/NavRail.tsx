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
      <div key={sectionKey} className="flex flex-col gap-[6px]">
        {section.label && (
          <div
            className={cn(
              "px-[8px] text-[8.5px] font-bold uppercase tracking-[0.22em] text-[var(--text3)]",
              collapsed && "mx-[8px] h-px overflow-hidden rounded-[1px] bg-[var(--panel2)] px-0 text-[0px] leading-none",
            )}
          >
            {section.label}
          </div>
        )}
        <div className="flex flex-col gap-1">
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
                onClick={() => onSelect(item.id)}
                className={cn(
                  "group relative flex h-[34px] w-full items-center gap-[10px] rounded-[calc(var(--r)-2px)] border px-[12px] py-2 text-left text-[12px] font-medium transition-colors outline-none before:absolute before:left-0 before:top-[7px] before:h-5 before:w-[3px] before:rounded-r before:bg-transparent focus-visible:border-[var(--line2)] focus-visible:ring-0",
                  collapsed && "justify-center gap-0 px-0",
                  isActive
                    ? "border-[var(--line)] bg-[var(--panel3)] text-[var(--accent)] before:bg-[var(--accent)]"
                    : "border-transparent text-[var(--text2)] hover:border-[var(--line)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
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
