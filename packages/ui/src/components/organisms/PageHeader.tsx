import * as React from "react"

import { cn } from "../../lib/utils"

export interface PageHeaderProps extends React.ComponentProps<"header"> {
  heading: React.ReactNode
  caption?: React.ReactNode
  status?: React.ReactNode
  actions?: React.ReactNode
}

export function PageHeader({
  heading,
  caption,
  status,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg-shell px-6 py-4",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        <h2 className="terminal-header text-sm font-bold tracking-[0.2em] text-foreground">
          {heading}
        </h2>
        {caption ? (
          <p className="status-readout mt-0.5 text-[10px] text-text-muted">
            {caption}
          </p>
        ) : null}
      </div>

      {status || actions ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {status ? (
            <div className="flex flex-wrap items-center gap-2">
              {status}
            </div>
          ) : null}
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}
