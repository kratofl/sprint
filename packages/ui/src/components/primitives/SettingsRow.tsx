import * as React from "react"

import { cn } from "../../lib/utils"

export type SettingsRowProps = React.ComponentProps<"div">

function SettingsRow({ className, ...props }: SettingsRowProps) {
  return (
    <div
      data-slot="settings-row"
      className={cn(
        "grid gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-[12px] text-[var(--text2)] last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
        className
      )}
      {...props}
    />
  )
}

export { SettingsRow }
