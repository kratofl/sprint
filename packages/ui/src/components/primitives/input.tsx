import * as React from "react"

import { cn } from "../../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-7 w-full min-w-0 rounded-sm border border-border bg-bg-shell px-2 py-0.5 text-xs/relaxed text-foreground transition-colors outline-none",
        "placeholder:text-text-disabled",
        "hover:border-border",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground",
        "focus:border-primary focus:text-foreground focus:ring-0 focus:outline-none",
        "data-[readout=true]:font-mono data-[readout=true]:tabular-nums",
        "data-[status=accent]:border-primary/50 data-[status=accent]:text-primary data-[status=accent]:focus:border-primary",
        "data-[status=neutral]:text-text-muted data-[status=neutral]:focus:border-border data-[status=neutral]:focus:text-foreground",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }

