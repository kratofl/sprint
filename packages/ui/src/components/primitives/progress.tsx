"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

// Figma "Progress Bar": track bg Neutral/800, radius pill, height 8;
// indicator fill Orange/500, radius pill.
function Progress({
  className,
  value,
  variant = "default",
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  variant?: "default" | "secondary" | "neutral" | "destructive"
  indicatorClassName?: string
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      data-variant={variant}
      className={cn(
        "relative flex h-2 w-full items-center overflow-hidden rounded-pill bg-[var(--panel2)]",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "size-full flex-1 rounded-pill transition-all",
          variant === "default" && "bg-[var(--orange)]",
          variant === "secondary" && "bg-[var(--green)]",
          variant === "neutral" && "bg-[var(--border-2)]",
          variant === "destructive" && "bg-[var(--red)]",
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
