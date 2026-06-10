import * as React from "react"

import { cn } from "../../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-control border border-[var(--border)] bg-[var(--panel-2)] px-[10px] text-[13px] text-[var(--text)] transition-colors outline-none",
        "placeholder:text-[var(--muted-2)]",
        "hover:border-[var(--border-2)]",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground",
        "focus:border-primary focus:text-[var(--text)] focus:ring-0 focus:outline-none",
        "data-[readout=true]:text-right data-[readout=true]:font-mono data-[readout=true]:tabular-nums",
        "data-[status=accent]:border-[var(--orange)] data-[status=accent]:text-[var(--orange)] data-[status=accent]:focus:border-[var(--orange)]",
        "data-[status=neutral]:text-[var(--muted)] data-[status=neutral]:focus:border-[var(--border)] data-[status=neutral]:focus:text-[var(--text)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-[var(--red)] aria-invalid:ring-0",
        className
      )}
      {...props}
    />
  )
}

export { Input }
