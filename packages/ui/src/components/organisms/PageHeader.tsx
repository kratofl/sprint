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
        "flex flex-wrap items-center justify-between gap-[14px] rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        <h2 className="font-inter text-[13px] font-bold text-[var(--text)]">
          {heading}
        </h2>
        {caption ? (
          <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">
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
