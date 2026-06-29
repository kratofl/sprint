import { IconLayoutSidebar } from '@tabler/icons-react'
import sprintIconUrl from '@/assets/brand/sprint-icon.svg'

interface SidebarBrandProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

/**
 * Sidebar logo row (Figma "Frame 5"): ember icon tile + SPRINT wordmark
 * (Space Grotesk Bold, accent) over a Saira tagline with a gradient underline,
 * plus the collapse control. The row doubles as a window drag handle.
 */
export function SidebarBrand({ collapsed, onToggleCollapse }: SidebarBrandProps) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-[14px]">
        <img
          src={sprintIconUrl}
          alt="Sprint"
          draggable={false}
          className="size-[24px] rounded-[8px]"
        />
        <button
          type="button"
          app-region="no-drag"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          className="flex size-[32px] items-center justify-center rounded-[999px] text-[var(--text3)] transition-colors hover:bg-[var(--panel2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <IconLayoutSidebar size={20} />
        </button>
      </div>
    )
  }

  return (
    <div app-region="drag" className="flex items-center gap-[10px]">
      <img
        src={sprintIconUrl}
        alt=""
        draggable={false}
        className="size-[24px] shrink-0 rounded-[8px]"
      />
      <div className="flex min-w-0 flex-col">
        <span
          className="text-[28px] font-bold leading-none text-[var(--accent)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          SPRINT
        </span>
        <span
          className="mt-[2px] text-[9px] font-bold uppercase leading-none tracking-[0.18em] text-[var(--text2)]"
          style={{ fontFamily: 'var(--font-saira)' }}
        >
          Telemetry System
        </span>
        <div className="mt-[2px] h-[2px] w-full rounded-full bg-gradient-to-r from-[var(--accent)] to-transparent" />
      </div>
      <button
        type="button"
        app-region="no-drag"
        onClick={onToggleCollapse}
        aria-label="Collapse sidebar"
        className="ml-auto flex size-[32px] shrink-0 items-center justify-center rounded-[999px] text-[var(--text3)] transition-colors hover:bg-[var(--panel2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
      >
        <IconLayoutSidebar size={20} />
      </button>
    </div>
  )
}
