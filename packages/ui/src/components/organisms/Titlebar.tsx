import * as React from "react"

import { cn } from "../../lib/utils"

export interface TitlebarProps extends React.ComponentProps<"header"> {
  "app-region"?: "drag" | "no-drag"
  logo?: React.ReactNode
  navigation?: React.ReactNode
  breadcrumb?: React.ReactNode
  status?: React.ReactNode
  metrics?: React.ReactNode
  windowControls?: React.ReactNode
}

function Titlebar({
  logo,
  navigation,
  breadcrumb,
  status,
  metrics,
  windowControls,
  className,
  ...props
}: TitlebarProps) {
  return (
    <header
      data-slot="titlebar"
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-[10px]",
        className
      )}
      {...props}
    >
      {logo}
      {navigation}
      {breadcrumb}
      <div className="flex-1" />
      {status}
      {metrics}
      {windowControls}
    </header>
  )
}

export { Titlebar }
