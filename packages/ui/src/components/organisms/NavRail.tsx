"use client"

import * as React from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { cn } from "../../lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../primitives/tooltip"


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
  /** Whether to render the built-in collapse toggle at the bottom. */
  showCollapseToggle?: boolean
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
 * Active item: left-side 2px accent bar + faint orange tint.
 */
export function NavRail({
  items,
  activeId,
  onSelect,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  showCollapseToggle = true,
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
          "relative flex flex-col bg-bg-shell border-r border-border",
          "transition-[width] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isCollapsed ? "w-[3.25rem]" : "w-[12.5rem]",
          className
        )}
      >
        {/* Header — optional slot, rendered only when provided */}
        {header != null && (
          <div
            className={cn(
              "flex h-12 shrink-0 items-center border-b border-[var(--outline)] overflow-hidden",
              isCollapsed ? "justify-center px-0" : "px-4",
              "[app-region:drag]"
            )}
          >
            {header}
          </div>
        )}

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-px overflow-hidden py-2">
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
                  // Layout — full width, no horizontal container padding so border-l reaches edge
                  "group relative flex h-9 w-full shrink-0 items-center gap-3",
                  "text-[11px] font-bold whitespace-nowrap uppercase tracking-[0.1em]",
                  "transition-colors duration-100 outline-none",
                  isCollapsed ? "justify-center px-0" : "pl-4 pr-3",
                  // Inactive
                  !isActive && "text-on-surface-variant hover:bg-white/[0.03] hover:text-foreground",
                  // Active: left accent bar + subtle tint
                  isActive && [
                    "text-accent bg-accent/[0.06]",
                    "border-l-2 border-accent",
                    // Compensate left padding so icon stays aligned
                    !isCollapsed && "pl-[calc(1rem-2px)]",
                  ]
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-accent" : "text-on-surface-variant group-hover:text-foreground"
                  )}
                />
                {/* Label — hidden when collapsed */}
                {!isCollapsed && (
                  <span className="overflow-hidden">
                    {item.label}
                  </span>
                )}
              </button>
            )

            if (isCollapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{itemContent}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8} className="surface-overlay-panel shadow-overlay text-foreground">
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
              "border-t border-[var(--outline)] px-2 py-2 overflow-hidden transition-all duration-150",
              isCollapsed ? "flex justify-center" : ""
            )}
          >
            {footer}
          </div>
        )}

        {showCollapseToggle && (
          <div className="border-t border-[var(--outline)] px-2 py-2">
            <button
              onClick={toggle}
              aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
              className={cn(
                "flex h-7 w-full items-center rounded text-on-surface-variant",
                "transition-colors duration-100 hover:bg-white/[0.03] hover:text-foreground",
                "outline-none focus-visible:ring-1 focus-visible:ring-accent/40",
                isCollapsed ? "justify-center" : "justify-end gap-1.5 pr-1 text-[0.625rem] uppercase tracking-widest"
              )}
            >
              {!isCollapsed && <span>Collapse</span>}
              {isCollapsed
                ? <IconChevronRight size={13} />
                : <IconChevronLeft size={13} />
              }
            </button>
          </div>
        )}
      </aside>
    </TooltipProvider>
  )
}
