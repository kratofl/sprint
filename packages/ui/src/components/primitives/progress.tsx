"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

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
        "relative flex h-1 w-full items-center overflow-x-hidden bg-border",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "size-full flex-1 transition-all",
          variant === "default" && "bg-primary",
          variant === "secondary" && "bg-secondary",
          variant === "neutral" && "bg-border-strong",
          variant === "destructive" && "bg-destructive",
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }

