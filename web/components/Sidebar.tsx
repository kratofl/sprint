'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Brand from './Brand'
import {
  IconAdjustmentsHorizontal,
  IconHeadset,
  IconHistory,
  IconHome,
  IconLayoutDashboard,
  IconLayoutSidebar,
  IconLogout,
  IconSettings,
  IconUser,
  type Icon,
} from '@tabler/icons-react'
import { isActive } from '@/lib/navigation'
import type { Viewer, ViewerState } from '@/lib/records'
import { signOut } from '@/lib/server/actions'

type NavEntry = { href: string; label: string; icon: Icon }

const PRIMARY: readonly NavEntry[] = [
  { href: '/', label: 'Overview', icon: IconHome },
  { href: '/sessions', label: 'Sessions', icon: IconHistory },
  { href: '/setups', label: 'Setups', icon: IconAdjustmentsHorizontal },
]

const TOOLS: readonly NavEntry[] = [
  { href: '/engineer', label: 'Race engineer', icon: IconHeadset },
  { href: '/dash', label: 'Dash editor', icon: IconLayoutDashboard },
]

const SETTINGS: NavEntry = { href: '/settings', label: 'Settings', icon: IconSettings }

// App navigation: the edge-to-edge glass sidebar. The collapse button in the
// top row toggles an icon-only rail; the same button expands it again. Labels
// stay in the DOM and fade, so the width can animate. Settings sits at the
// foot, above who is signed in with a sign-out button, or a sign-in link.
export default function Sidebar({ viewer }: { viewer: ViewerState }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const toggleLabel = collapsed ? 'Show sidebar' : 'Hide sidebar'

  const item = ({ href, label, icon: ItemIcon }: NavEntry) => (
    <Link
      key={href}
      href={href}
      className="nav-item"
      aria-current={isActive(pathname, href) ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
    >
      <ItemIcon className="nav-icon" size={16} stroke={1.8} aria-hidden />
      <span className="nav-label" aria-hidden={collapsed}>
        {label}
      </span>
    </Link>
  )

  return (
    <nav className="sidebar" aria-label="Main navigation" data-collapsed={collapsed}>
      <div className="sidebar-head">
        <span className="sidebar-brand" aria-hidden={collapsed}>
          <Brand />
        </span>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          title={toggleLabel}
          onClick={() => setCollapsed((value) => !value)}
        >
          <IconLayoutSidebar size={16} stroke={1.8} aria-hidden />
        </button>
      </div>

      {PRIMARY.map(item)}
      <span className="nav-section" role={collapsed ? 'separator' : undefined}>
        {!collapsed && 'Tools'}
      </span>
      {TOOLS.map(item)}

      <div className="sidebar-spacer" />
      {item(SETTINGS)}
      {viewer.kind === 'signed-out' ? (
        // Only reachable with a cookie the API no longer accepts (the proxy
        // sends cookie-less visitors to /sign-in first), so go through
        // /sign-out to clear it, or /sign-in would bounce straight back here.
        <Link
          href={`/sign-out?next=${encodeURIComponent(pathname)}`}
          className="sidebar-user"
          aria-label={collapsed ? 'Sign in' : undefined}
          title={collapsed ? 'Sign in' : undefined}
        >
          <span className="avatar" aria-hidden>
            <IconUser size={14} stroke={1.8} />
          </span>
          {!collapsed && 'Sign in'}
        </Link>
      ) : (
        <div className="sidebar-user">
          <span className="avatar" aria-hidden title={collapsed ? footerName(viewer) : undefined}>
            {viewer.kind === 'signed-in' ? initials(viewerName(viewer.viewer)) : <IconUser size={14} stroke={1.8} />}
          </span>
          <span className={collapsed ? 'visually-hidden' : 'sidebar-user-name'} title={footerName(viewer)}>
            {footerName(viewer)}
          </span>
          <form action={signOut} className="sidebar-signout">
            <button type="submit" className="sidebar-action" aria-label="Sign out" title="Sign out">
              <IconLogout size={16} stroke={1.8} aria-hidden />
            </button>
          </form>
        </div>
      )}
    </nav>
  )
}

// The footer label: the viewer's name, or a plain "Signed in" while the API
// cannot say who that is.
function footerName(viewer: Exclude<ViewerState, { kind: 'signed-out' }>): string {
  return viewer.kind === 'signed-in' ? viewerName(viewer.viewer) : 'Signed in'
}

// The name the footer shows: the display name, else the email.
function viewerName(viewer: Viewer): string {
  return viewer.displayName.trim() || viewer.email
}

// Up to two initials for the avatar: "Alex Morgan" → "AM", "alex@x.de" → "A".
function initials(name: string): string {
  const words = name.split(/[\s@._-]+/).filter(Boolean)
  const letters = name.includes('@') ? words.slice(0, 1) : words.slice(0, 2)
  return letters.map((word) => word[0].toUpperCase()).join('')
}
