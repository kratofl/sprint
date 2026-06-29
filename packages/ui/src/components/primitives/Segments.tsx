"use client"

import * as React from "react"

import { cn } from "../../lib/utils"

export type SegmentsProps = Omit<React.ComponentProps<"div">, "role" | "aria-valuenow"> & {
  /** Total number of segments. */
  total: number
  /** Number of leading segments rendered as filled (clamped to [0, total]). */
  filled: number
  /** Gap between segments, in px (Figma default = space-2 / 4px). */
  gap?: number
  /** Accessible label for the stepped progress group. */
  label?: string
}

// Figma "Segments": a stepped progress indicator — a row of small pill
// segments (h8). Filled = Orange/500, empty = Neutral/800.
function Segments({
  total,
  filled,
  gap = 4,
  label,
  className,
  style,
  ...props
}: SegmentsProps) {
  const safeTotal = Math.max(0, Math.floor(total))
  const safeFilled = Math.min(safeTotal, Math.max(0, Math.floor(filled)))

  return (
    <div
      {...props}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-valuenow={safeFilled}
      data-slot="segments"
      className={cn("flex w-full items-center", className)}
      style={{ gap: `${gap}px`, ...style }}
    >
      {Array.from({ length: safeTotal }, (_, index) => (
        <span
          key={index}
          data-slot="segment"
          data-filled={index < safeFilled}
          className={cn(
            "h-2 flex-1 rounded-pill transition-colors",
            index < safeFilled ? "bg-[var(--orange)]" : "bg-[var(--panel2)]"
          )}
        />
      ))}
    </div>
  )
}

export { Segments }
