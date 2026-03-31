"use client"

import * as React from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { cn } from "../../lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../primitives/tooltip"
import { SprintLogo, SprintIcon } from "../atoms/SprintLogo"

export interface NavRailItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number }>
}

export interface NavRailProps {
  items: NavRailItem[]
  activeId: string
  onSelect: (id: string) => void
  /** Controlled collapsed state. When omitted, the rail manages its own state. */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** Slot rendered at the very top (e.g. app wordmark) */
  header?: React.ReactNode
  /** Slot rendered at the bottom above the toggle (e.g. connection badge) */
  footer?: React.ReactNode
  className?: string
}

/**
 * NavRail — icon-forward collapsible navigation.
 *
 * Collapsed (52px): icons only, labels appear as tooltips.
 * Expanded (200px): icons + labels, left-aligned.
 * Active item: left accent bar + muted orange tint background.
 */
export function NavRail({
  items,
  activeId,
  onSelect,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  header,
  footer,
  className,
}: NavRailProps) {
  const [internalCollapsed, setInternalCollapsed] = React.useState(false)
  const isCollapsed = controlledCollapsed ?? internalCollapsed

  function toggle() {
    const next = !isCollapsed
    setInternalCollapsed(next)
    onCollapsedChange?.(next)
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        data-slot="nav-rail"
        data-collapsed={isCollapsed}
        className={cn(
          "relative flex flex-col bg-bg-container border-r border-border-base",
          "transition-[width] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isCollapsed ? "w-[3.25rem]" : "w-[12.5rem]",
          className
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex h-12 shrink-0 items-center overflow-hidden",
            isCollapsed ? "justify-center px-0" : "px-4",
            "[app-region:drag]"
          )}
        >
          {header ?? (
            isCollapsed
              ? <SprintIcon size={22} />
              : <SprintLogo size="sm" />
          )}
        </div>

        {/* Divider spacing */}
        <div className="mx-3 mb-1" />

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-hidden px-2 py-2">
          {items.map((item) => {
            const isActive = item.id === activeId
            const Icon = item.icon

            const itemContent = (
              <button
                key={item.id}
                data-slot="nav-rail-item"
                data-active={isActive}
                onClick={() => onSelect(item.id)}
                className={cn(
                  // Layout
                  "group relative flex h-8 w-full shrink-0 items-center gap-2.5 overflow-hidden rounded",
                  "px-3 text-[11px] font-bold whitespace-nowrap uppercase tracking-[0.1em] transition-all duration-100",
                  "outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                  // Inactive
                  !isActive && "text-on-surface-variant hover:bg-white/[0.02] hover:text-foreground",
                  // Active: right accent border + subtle bg (matches HTML reference)
                  isActive && [
                    "text-accent bg-accent/5",
                    "border-r-2 border-accent",
                  ]
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-accent" : "text-text-secondary group-hover:text-text-primary"
                  )}
                />
                {/* Label — hidden when collapsed */}
                <span
                  className={cn(
                    "transition-[opacity,max-width] duration-150 overflow-hidden",
                    isCollapsed ? "max-w-0 opacity-0" : "max-w-full opacity-100"
                  )}
                >
                  {item.label}
                </span>
              </button>
            )

            if (isCollapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{itemContent}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8} className="surface-elevated">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return itemContent
          })}
        </nav>

        {/* Footer slot */}
        {footer && (
          <div
            className={cn(
              "overflow-hidden px-2 py-2 transition-all duration-150",
              isCollapsed ? "flex justify-center" : ""
            )}
          >
            {footer}
          </div>
        )}

        {/* Collapse toggle */}
        <div className="px-2 pb-3 pt-2">
          <button
            onClick={toggle}
            aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
            className={cn(
              "flex h-8 w-full items-center rounded-md px-2 text-text-muted",
              "transition-colors duration-100 hover:bg-bg-subtle hover:text-text-secondary",
              "outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
              isCollapsed ? "justify-center" : "justify-end gap-1.5 text-[0.625rem]"
            )}
          >
            {!isCollapsed && <span>Collapse</span>}
            {isCollapsed
              ? <IconChevronRight size={14} />
              : <IconChevronLeft size={14} />
            }
          </button>
        </div>
      </aside>
    </TooltipProvider>
  )
}
