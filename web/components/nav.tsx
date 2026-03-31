import Link from 'next/link'

const NAV_ITEMS = [
  { href: '/',           label: 'Dashboard' },
  { href: '/sessions',   label: 'Sessions' },
  { href: '/engineer',   label: 'Engineer' },
  { href: '/setups',     label: 'Setups' },
  { href: '/dash',       label: 'Dash Editor' },
]

export default function Nav() {
  return (
    <header className="border-b border-border-base bg-bg-surface sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-widest text-accent">
            SPRINT
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}
