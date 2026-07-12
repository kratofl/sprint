import * as React from "react"

import { cn } from "../../lib/utils"

export interface AppShellProps extends React.ComponentProps<"div"> {
  titlebar: React.ReactNode
  sidebar: React.ReactNode
  children: React.ReactNode
  sidebarCollapsed?: boolean
}

function AppShell({
  titlebar,
  sidebar,
  sidebarCollapsed = false,
  children,
  className,
  ...props
}: AppShellProps) {
  return (
    <div
      data-slot="app-shell"
      className={cn(
        "fd tone-graphite flex h-screen w-screen flex-col overflow-hidden bg-[var(--panel)] font-sans text-[var(--text)]",
        className
      )}
      {...props}
    >
      {titlebar}
      <div data-slot="app-shell-frame" className="flex min-h-0 flex-1">
        <aside
          data-slot="app-shell-sidebar"
          data-collapsed={sidebarCollapsed}
          className={cn(
            "flex shrink-0 flex-col justify-between gap-[14px] border-r border-[var(--line)] bg-[var(--panel)] transition-[width,padding] duration-150",
            sidebarCollapsed ? "w-[62px] px-[9px] py-[10px]" : "w-[208px] p-[10px]"
          )}
        >
          {sidebar}
        </aside>
        <section data-slot="app-shell-body" className="flex min-w-0 flex-1 flex-col p-[10px]">
          {children}
        </section>
      </div>
    </div>
  )
}

export { AppShell }
