import * as React from "react"

import { cn } from "../../lib/utils"

// Figma "Navigation Item": a sidebar nav row — height 32, pad 8×10, gap 10,
// leading Tabler icon (16) + Label (Inter Medium 13).
//   Default : transparent bg, text Neutral/300 (radius pill).
//   Selected: bg Neutral/700, text Orange/500, radius xl (18), aria-current.
// Supports a collapsed (icon-only) mode and an optional trailing slot. Renders a
// <button> by default, or an <a> when `href` is given, with an accent
// focus-visible ring per macOS HIG.
export type NavigationItemProps = {
  /** Leading Tabler icon element (sized to 16). */
  icon: React.ReactNode
  /** Visible label; also used as the accessible name when collapsed. */
  label: string
  selected?: boolean
  /** Icon-only mode for a collapsed sidebar. */
  collapsed?: boolean
  onSelect?: () => void
  /** Render as an anchor instead of a button. */
  href?: string
  /** Optional trailing content (count badge, chevron, status dot…). */
  trailing?: React.ReactNode
  className?: string
} & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement> &
    React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onSelect" | "children" | "href"
>

function NavigationItem({
  icon,
  label,
  selected = false,
  collapsed = false,
  onSelect,
  href,
  trailing,
  className,
  ...props
}: NavigationItemProps) {
  const classes = cn(
    "group/nav-item inline-flex h-[32px] items-center gap-2.5 font-sans text-[13px] font-medium tracking-[0] whitespace-nowrap outline-none transition-colors",
    // Default chrome: transparent surface, muted text, pill radius.
    "rounded-pill bg-transparent text-[var(--text2)] hover:text-[var(--text)]",
    // Selected chrome: Neutral/700 surface, accent text, radius xl (18).
    "data-[selected=true]:rounded-xl data-[selected=true]:bg-[var(--panel3)] data-[selected=true]:text-[var(--accent)]",
    // Accent focus ring (macOS HIG).
    "focus-visible:border focus-visible:border-[var(--accent)] focus-visible:outline-none",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
    collapsed ? "w-[32px] justify-center p-1" : "px-2.5 py-2",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    className
  )

  const content = (
    <>
      <span data-slot="nav-icon" className="inline-flex shrink-0 items-center justify-center">
        {icon}
      </span>
      {!collapsed && (
        <>
          <span data-slot="nav-label" className="flex-1 truncate text-left">
            {label}
          </span>
          {trailing != null && (
            <span data-slot="nav-trailing" className="inline-flex shrink-0 items-center">
              {trailing}
            </span>
          )}
        </>
      )}
    </>
  )

  const sharedProps = {
    "data-slot": "navigation-item",
    "data-selected": selected,
    "data-collapsed": collapsed,
    "aria-current": selected ? ("page" as const) : undefined,
    // When collapsed there is no visible label → expose it as the accessible name.
    "aria-label": collapsed ? label : undefined,
    title: collapsed ? label : undefined,
    className: classes,
  }

  if (href != null) {
    return (
      <a
        {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
        {...sharedProps}
        href={href}
        onClick={onSelect}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      type="button"
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      {...sharedProps}
      onClick={onSelect}
    >
      {content}
    </button>
  )
}

export { NavigationItem }
