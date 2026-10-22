'use client'

// The app shell around every page but sign-in: the glass sidebar (or the phone tab
// bar), and the content area with the toolbar band on top and toasts at the bottom.
// The ambient light trails (`backdrop`) sit behind all of it: they show through the
// sidebar and toolbar glass and, dimmed by the content veil, between the cards.
// Desktop pins the sidebar and scrolls only the content pane; phones scroll the
// document, so the browser can collapse its address bar.

import { useCallback, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  IconAdjustmentsHorizontal,
  IconHeadset,
  IconHistory,
  IconHome,
  IconLayoutDashboard,
  IconSettings,
} from '@tabler/icons-react'
import { ProfileMenu } from '@/components/app/profile-menu'
import { MobileTabBar, Sidebar, SidebarLink, SidebarSection, useSidebarCollapsed, useSidebarFolds, type NavEntry } from '@/components/app/sidebar'
import { Toast, ToastContext } from '@/components/app/toast'
import { ToolbarFrame } from '@/components/app/toolbar'
import { isActive } from '@/lib/navigation'
import type { ViewerState } from '@/lib/records'

const PRIMARY: readonly NavEntry[] = [
  { href: '/', label: 'Overview', icon: IconHome },
  { href: '/sessions', label: 'Sessions', icon: IconHistory },
  { href: '/engineer', label: 'Race engineers', icon: IconHeadset },
  { href: '/setups', label: 'Setups', icon: IconAdjustmentsHorizontal },
]

const TOOLS: readonly NavEntry[] = [{ href: '/dash', label: 'Dash editor', icon: IconLayoutDashboard }]

// Phones have no profile menu, so Settings is a tab.
const TABS: readonly NavEntry[] = [
  { href: '/', label: 'Overview', icon: IconHome },
  { href: '/sessions', label: 'Sessions', icon: IconHistory },
  { href: '/engineer', label: 'Engineers', icon: IconHeadset },
  { href: '/setups', label: 'Setups', icon: IconAdjustmentsHorizontal },
  { href: '/dash', label: 'Dash', icon: IconLayoutDashboard },
  { href: '/settings', label: 'Settings', icon: IconSettings },
]

export function AppShell({ viewer, backdrop, children }: { viewer: ViewerState; backdrop: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  const active = (href: string) => isActive(pathname, href)
  const { collapsed, toggle } = useSidebarCollapsed()
  const folds = useSidebarFolds(TOOLS.some((entry) => active(entry.href)) ? ['tools'] : [])
  const [message, setMessage] = useState<string | null>(null)
  // The toast calls this after its few seconds; stable so its timer is not reset on every render.
  const clearMessage = useCallback(() => setMessage(null), [])

  return (
    <div className="relative isolate flex min-h-screen text-label lg:h-screen lg:overflow-hidden">
      {backdrop}
      <Sidebar collapsed={collapsed} toggle={toggle} footer={<ProfileMenu viewer={viewer} collapsed={collapsed} />}>
        {PRIMARY.map((entry) => (
          <SidebarLink key={entry.href} collapsed={collapsed} entry={entry} active={active(entry.href)} />
        ))}
        <SidebarSection collapsed={collapsed} open={folds.isOpen('tools')} onToggle={() => folds.toggle('tools')} label="Tools">
          {TOOLS.map((entry) => (
            <SidebarLink key={entry.href} collapsed={collapsed} entry={entry} active={active(entry.href)} />
          ))}
        </SidebarSection>
      </Sidebar>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <ToastContext.Provider value={setMessage}>
          <main className="content-veil flex-1 lg:min-h-0 lg:overflow-y-auto">
            <ToolbarFrame>
              <div key={pathname} className="rise space-y-4 px-5 pt-5 pb-10 max-lg:pb-32">
                {children}
              </div>
            </ToolbarFrame>
          </main>
        </ToastContext.Provider>

        {/* Toasts sit at the bottom centre of the content area, above the phone tab bar. */}
        <div role="status" className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4 max-lg:fixed max-lg:bottom-[96px]">
          {message ? <Toast key={message} message={message} onDismiss={clearMessage} /> : null}
        </div>
      </div>

      <MobileTabBar entries={TABS} isActive={active} />
    </div>
  )
}
