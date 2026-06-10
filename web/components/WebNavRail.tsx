"use client"

import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@sprint/ui'
import {
  IconLayoutDashboard,
  IconHistory,
  IconHeadset,
  IconAdjustmentsHorizontal,
  IconLayout,
} from '@tabler/icons-react'

const NAV_ITEMS = [
  { id: '/',         label: 'DASHBOARD',   icon: IconLayoutDashboard },
  { id: '/sessions', label: 'SESSIONS',    icon: IconHistory },
  { id: '/engineer', label: 'ENGINEER',    icon: IconHeadset },
  { id: '/setups',   label: 'SETUPS',      icon: IconAdjustmentsHorizontal },
  { id: '/dash',     label: 'DASH_EDITOR', icon: IconLayout },
]

export default function WebNavRail() {
  const pathname = usePathname()
  const router   = useRouter()

  // Resolve active item: exact match for root, prefix match for others
  const activeId = NAV_ITEMS.find((item) =>
    item.id === '/'
      ? pathname === '/'
      : pathname.startsWith(item.id)
  )?.id ?? '/'

  return (
    <aside className="flex w-[220px] shrink-0 flex-col justify-between bg-[var(--panel)] p-[10px]">
      <div className="space-y-[14px]">
        <div className="flex items-center gap-2 px-[6px]">
          <span className="grid size-5 place-items-center rounded-[6px] bg-[var(--orange)] font-space text-[13px] font-bold text-[var(--panel)]">
            S
          </span>
          <span className="font-inter text-[13px] font-bold text-white">Sprint</span>
        </div>

        <nav className="space-y-[6px]" aria-label="Primary">
          <p className="px-[6px] font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">
            Web
          </p>
          <div className="space-y-1">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = activeId === id

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => router.push(id)}
                  className={cn(
                    "flex h-8 w-full items-center gap-[10px] rounded-control border px-[10px] py-2 text-left font-inter text-[13px] font-medium",
                    active
                      ? "border-[var(--orange)] bg-[var(--panel-3)] text-[var(--orange)]"
                      : "border-transparent text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]",
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="size-4 shrink-0" stroke={1.8} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      <span className="mx-[6px] inline-flex h-5 w-fit items-center rounded-[4px] border border-[var(--border)] px-[10px] font-saira-sc text-[12px] font-bold text-[var(--muted)]">
        WEB
      </span>
    </aside>
  )
}
