import * as React from "react"

import { cn } from "../../lib/utils"

// Figma "Widget" tile: 107×46, bg Surface/Tile #1F1F1F, radius md (12),
// optional 1px Border/Default, pad 8, gap 6. Icon 13 + title Inter SemiBold 11
// Neutral/300 in a column layout. Selected → accent border.
export type TileProps = React.ComponentProps<"div"> & {
  selected?: boolean
  /** Optional leading Tabler icon (13px) for the editor-widget tile layout. */
  icon?: React.ReactNode
  /** Optional label rendered as Inter SemiBold 11, Neutral/300. */
  label?: React.ReactNode
}

function Tile({ selected = false, className, icon, label, children, ...props }: TileProps) {
  const isWidgetLayout = icon != null || label != null

  return (
    <div
      data-slot="tile"
      data-selected={selected}
      className={cn(
        "rounded-md border border-[var(--line)] bg-[var(--panel2)] text-[12px] text-[var(--text2)] transition-colors",
        "data-[selected=true]:border-[var(--accent)] data-[selected=true]:bg-[var(--panel)] data-[selected=true]:text-[var(--text)]",
        isWidgetLayout ? "flex flex-col gap-1.5 p-2" : "p-3",
        className
      )}
      {...props}
    >
      {isWidgetLayout ? (
        <>
          {icon != null ? (
            <span
              data-slot="tile-icon"
              className="inline-flex shrink-0 items-center text-[var(--text2)] [&_svg]:size-[13px]"
            >
              {icon}
            </span>
          ) : null}
          {label != null ? (
            <span
              data-slot="tile-label"
              className="font-sans text-[11px] font-semibold leading-none text-[var(--text2)]"
            >
              {label}
            </span>
          ) : null}
          {children}
        </>
      ) : (
        children
      )}
    </div>
  )
}

export { Tile }
