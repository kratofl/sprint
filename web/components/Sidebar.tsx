'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconAdjustmentsHorizontal,
  IconHeadset,
  IconHistory,
  IconHome,
  IconLayoutDashboard,
  IconLayoutSidebar,
  IconUser,
  type Icon,
} from '@tabler/icons-react'
import { isActive } from '@/lib/navigation'

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

// App navigation: the edge-to-edge web sidebar. The collapse button in the top
// row toggles an icon-only rail; the same button expands it again.
export default function Sidebar() {
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
      {!collapsed && label}
    </Link>
  )

  return (
    <nav className="sidebar" aria-label="Main navigation" data-collapsed={collapsed}>
      <div className="sidebar-head">
        {!collapsed && (
          <>
            <span className="app-tile" aria-hidden>S</span>
            <span className="app-name">Sprint</span>
          </>
        )}
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
      <div className="sidebar-user" title={collapsed ? 'Not signed in' : undefined}>
        <span className="avatar" aria-hidden>
          <IconUser size={14} stroke={1.8} />
        </span>
        {!collapsed && 'Not signed in'}
      </div>
    </nav>
  )
}
