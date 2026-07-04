import * as React from "react"

import { cn } from "../../lib/utils"

export type BodyTrayProps = React.ComponentProps<"main">

function BodyTray({ className, ...props }: BodyTrayProps) {
  return (
    <main
      data-slot="body-tray"
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[calc(var(--r)+2px)] border border-[var(--line2)] bg-[var(--bg)]",
        className
      )}
      {...props}
    />
  )
}

export { BodyTray }
