"use client"

import { usePathname, useRouter } from 'next/navigation'
import { Badge, NavRail, NavRailItem, SprintIcon } from '@sprint/ui'
import {
  IconLayoutDashboard,
  IconHistory,
  IconHeadset,
  IconAdjustmentsHorizontal,
  IconLayout,
} from '@tabler/icons-react'

const NAV_ITEMS: NavRailItem[] = [
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
    <NavRail
      items={NAV_ITEMS}
      activeId={activeId}
      onSelect={(id) => router.push(id)}
      header={<SprintIcon size={18} />}
      footer={<Badge variant="neutral" className="font-mono">WEB</Badge>}
    />
  )
}
