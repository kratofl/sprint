'use client'

// Who is signed in, at the bottom of the sidebar: an avatar and name that open
// Settings and Sign out. Those are personal, so on desktop they live here and
// nowhere else. While the API cannot say who is signed in, the row reads "Signed
// in" and sign-out stays reachable. A cookie the API no longer accepts shows a
// "Sign in" link that goes through /sign-out to clear it.

import { useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconLogout, IconSettings, IconUser } from '@tabler/icons-react'
import { sidebarRowClass } from '@/components/app/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ViewerState } from '@/lib/records'
import { signOut } from '@/lib/server/actions'
import { cn } from '@/lib/utils'
import { initials, viewerName } from '@/lib/viewer'

export function ProfileMenu({ viewer, collapsed }: { viewer: ViewerState; collapsed: boolean }) {
  const pathname = usePathname()
  const [signingOut, startSignOut] = useTransition()

  if (viewer.kind === 'signed-out') {
    // Only reachable with a cookie the API no longer accepts (the proxy sends
    // cookie-less visitors to /sign-in first), so go through /sign-out to clear
    // it, or /sign-in would bounce straight back here.
    return (
      <Link
        href={`/sign-out?next=${encodeURIComponent(pathname)}`}
        title={collapsed ? 'Sign in' : undefined}
        aria-label={collapsed ? 'Sign in' : undefined}
        className={cn(sidebarRowClass, 'h-9', collapsed && 'justify-center px-0')}
      >
        <IconUser />
        {collapsed ? null : <span className="min-w-0 truncate">Sign in</span>}
      </Link>
    )
  }

  const name = viewer.kind === 'signed-in' ? viewerName(viewer.viewer) : 'Signed in'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={collapsed ? name : undefined}
        aria-label={collapsed ? name : undefined}
        className={cn(sidebarRowClass, 'h-9 aria-expanded:bg-fill', collapsed && 'justify-center px-0')}
      >
        <Avatar size="sm" className="size-6">
          {viewer.kind === 'signed-in' && viewer.viewer.avatarUrl ? <AvatarImage src={viewer.viewer.avatarUrl} alt="" /> : null}
          <AvatarFallback>{viewer.kind === 'signed-in' ? initials(name) : <IconUser className="size-3.5" />}</AvatarFallback>
        </Avatar>
        {collapsed ? null : <span className="min-w-0 truncate">{name}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[230px]">
        <DropdownMenuLabel>{viewer.kind === 'signed-in' ? viewer.viewer.email || name : name}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <IconSettings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={() => startSignOut(() => signOut())}>
          <IconLogout />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
