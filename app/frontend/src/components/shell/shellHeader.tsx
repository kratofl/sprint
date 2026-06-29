import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * The content area renders a single header bar (Figma "Header", h45) that hosts
 * the window controls. Each view injects its own contextual toolbar into that
 * bar through this portal, so there is exactly one header on screen — no stacked
 * app-titlebar + view-toolbar chrome — while view state stays local to the view.
 */
const ShellHeaderSlotContext = createContext<HTMLElement | null>(null)

export const ShellHeaderSlotProvider = ShellHeaderSlotContext.Provider

export function useShellHeaderSlot(): HTMLElement | null {
  return useContext(ShellHeaderSlotContext)
}

/** Renders `children` into the shared content header. No-op until the slot mounts. */
export function HeaderPortal({ children }: { children: ReactNode }) {
  const slot = useShellHeaderSlot()
  if (!slot) return null
  return createPortal(children, slot)
}

/**
 * Standard contextual header for a non-editor view: a left title cluster and an
 * optional right action/status cluster. Interactive children opt out of the
 * window drag region via `no-drag`.
 */
export function ViewHeader({
  title,
  caption,
  leading,
  actions,
}: {
  title?: ReactNode
  caption?: ReactNode
  leading?: ReactNode
  actions?: ReactNode
}) {
  return (
    <HeaderPortal>
      <div className="flex min-w-0 items-center gap-[10px]">
        {leading}
        {(title || caption) && (
          <div className="flex min-w-0 flex-col">
            {title && (
              <span className="truncate text-[14px] font-semibold leading-tight text-[var(--text)]">
                {title}
              </span>
            )}
            {caption && (
              <span className="truncate text-[11px] leading-tight text-[var(--text3)]">
                {caption}
              </span>
            )}
          </div>
        )}
      </div>
      {actions && (
        <div app-region="no-drag" className="ml-auto flex items-center gap-[10px]">
          {actions}
        </div>
      )}
    </HeaderPortal>
  )
}
