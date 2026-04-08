import * as React from "react"
import { cn } from "../../lib/utils"

export interface SprintLogoProps {
  /** Rendered height in pixels. Width scales proportionally. */
  size?: number
  className?: string
}

/**
 * SprintIcon — the compact square logomark only.
 * Use in collapsed nav rails or tight spaces.
 */
export function SprintIcon({ size = 24, className }: SprintLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-label="Sprint"
      className={cn("shrink-0", className)}
    >
      {/* Speed chevron mark in brand orange */}
      <path
        d="M4 17 L10 7 L14 13 L17 9 L20 13"
        stroke="#EF8118"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * SprintLogo — full horizontal wordmark (icon + "Sprint" text).
 * Use in expanded nav rail headers and splash screens.
 */
export function SprintLogo({ size = 24, className }: SprintLogoProps) {
  const textSize = size * 0.75
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 select-none", className)}
      aria-label="Sprint"
    >
      <SprintIcon size={size} />
      <span
        style={{ fontSize: textSize, lineHeight: 1 }}
        className="font-bold tracking-tight text-foreground"
      >
        Sprint
      </span>
    </span>
  )
}
