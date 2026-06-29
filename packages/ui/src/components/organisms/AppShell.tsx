import * as React from "react"

import { cn } from "../../lib/utils"

export interface AppShellProps extends React.ComponentProps<"div"> {
  sidebar: React.ReactNode
  children: React.ReactNode
  sidebarCollapsed?: boolean
}

/**
 * Desktop window frame (Figma "application" / "Frame 3"): a flat Surface/App
 * body holding a full-height sidebar and the content column. Rounded floating
 * panels (sidebar + content) sit on the app background with a small inset, in
 * place of the native OS window chrome (frameless). No top titlebar — the
 * single header lives inside the content column.
 */
function AppShell({
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
        "fd tone-graphite flex h-screen w-screen overflow-hidden bg-[var(--bg)] font-sans text-[var(--text)]",
        className
      )}
      {...props}
    >
      <aside
        data-slot="app-shell-sidebar"
        data-collapsed={sidebarCollapsed}
        className={cn(
          // Flush to the window's left/top/bottom edges; only the inner (right)
          // corners round (Figma sidebar r[_,18,18,_]).
          "flex shrink-0 flex-col gap-[14px] overflow-hidden rounded-r-[18px] border border-[var(--line)] bg-[var(--panel)] p-[14px] transition-[width] duration-150",
          sidebarCollapsed ? "w-[72px]" : "w-[220px]"
        )}
      >
        {sidebar}
      </aside>
      <section
        data-slot="app-shell-body"
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
      >
        {children}
      </section>
    </div>
  )
}

export { AppShell }
