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
        "ds-head",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        <h1>
          {heading}
        </h1>
        {caption ? (
          <p>
            {caption}
          </p>
        ) : null}
      </div>

      {status || actions ? (
        <div className="ds-acts">
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
