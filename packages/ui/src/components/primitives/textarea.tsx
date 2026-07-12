import * as React from "react"

import { cn } from "../../lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none rounded-control border border-[var(--border)] bg-[var(--panel-2)] px-[10px] py-2 text-[13px] text-[var(--text)] transition-colors outline-none",
        "placeholder:text-[var(--muted-2)]",
        "focus:border-primary focus:ring-0 focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-[var(--red)] aria-invalid:ring-0",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
