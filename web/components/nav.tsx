import Link from 'next/link'
import { cn } from '@sprint/ui'
import { IconLayoutDashboard } from '@tabler/icons-react'

const NAV_ITEMS = [
  { href: '/',           label: 'Dashboard' },
  { href: '/sessions',   label: 'Sessions' },
  { href: '/engineer',   label: 'Engineer' },
  { href: '/setups',     label: 'Setups' },
  { href: '/dash',       label: 'Dash Editor' },
]

export default function Nav() {
  return (
    <header className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-1">
      <div className="flex items-center justify-between gap-2">
        <Link href="/" className="flex h-8 items-center gap-[10px] rounded-control px-[10px] py-2 font-inter text-[13px] font-bold text-[var(--orange)]">
          <span className="grid size-5 place-items-center rounded-[6px] bg-[var(--orange)] text-[var(--panel)]">
            S
          </span>
          SPRINT
        </Link>
        <nav className="flex items-center gap-[2px]">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-8 items-center gap-[10px] rounded-control border px-[10px] py-2 font-inter text-[13px] font-medium",
                "border-transparent text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]",
              )}
            >
              <IconLayoutDashboard className="size-4" stroke={1.8} />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
