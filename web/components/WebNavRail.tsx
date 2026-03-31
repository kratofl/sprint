"use client"

import { usePathname, useRouter } from 'next/navigation'
import { NavRail, NavRailItem } from '@sprint/ui'
import {
  IconLayoutDashboard,
  IconHistory,
  IconHeadset,
  IconAdjustmentsHorizontal,
  IconLayout,
} from '@tabler/icons-react'

const NAV_ITEMS: NavRailItem[] = [
  { id: '/',         label: 'Dashboard',  icon: IconLayoutDashboard },
  { id: '/sessions', label: 'Sessions',   icon: IconHistory },
  { id: '/engineer', label: 'Engineer',   icon: IconHeadset },
  { id: '/setups',   label: 'Setups',     icon: IconAdjustmentsHorizontal },
  { id: '/dash',     label: 'Dash',       icon: IconLayout },
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
    <NavRail
      items={NAV_ITEMS}
      activeId={activeId}
      onSelect={(id) => router.push(id)}
    />
  )
}
