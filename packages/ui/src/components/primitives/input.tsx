import * as React from "react"

import { cn } from "../../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Ghost bottom border only — no full box border
        "h-7 w-full min-w-0 rounded border-0 border-b border-b-border-base bg-bg-elevated px-2 py-0.5 text-xs/relaxed text-foreground transition-colors outline-none",
        "placeholder:text-text-disabled",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground",
        // Focus: 2px bottom bar in primary accent
        "focus:border-b-2 focus:border-b-accent focus:ring-0 focus:outline-none",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-b-destructive aria-invalid:ring-0",
        className
      )}
      {...props}
    />
  )
}

export { Input }

