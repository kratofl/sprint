import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppShell,
  ConfirmDialog,
  NavRail,
  type NavRailSection,
} from '@sprint/ui'
import {
  IconGauge,
  IconHelp,
  IconLayoutDashboard,
  IconSettings,
  IconUsb,
} from '@tabler/icons-react'
import Home from '@/views/Home'
import DashEditor, { type DashEditorHandle } from '@/views/DashEditor'
import Devices from '@/views/Devices'
import Settings from '@/views/Settings'
import Help from '@/views/Help'
import { useTelemetry } from '@/hooks/useTelemetry'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
import SplashScreen from '@/components/SplashScreen'
import UpdateToast from '@/components/UpdateToast'
import { SidebarBrand } from '@/components/shell/SidebarBrand'
import { WindowControls } from '@/components/shell/WindowControls'
import { ShellHeaderSlotProvider } from '@/components/shell/shellHeader'
import { APP_EVENTS } from '@/lib/desktopEvents'
import {
  createViewHistory,
  navigateToView,
  type AppView,
  type ViewHistory,
} from '@/lib/appShell'
import { windowAPI } from '@/lib/window'
import { onEvent } from '@/lib/wails'

type View = AppView

const NAV_SECTIONS: NavRailSection[] = [
  {
    items: [
      { id: 'home', label: 'Home', icon: IconGauge },
    ],
  },
  {
    label: 'Devices',
    items: [
      { id: 'devices', label: 'Devices', icon: IconUsb },
      { id: 'dashboards', label: 'Dashboards', icon: IconLayoutDashboard },
    ],
  },
  {
    pinned: 'bottom',
    items: [
      { id: 'settings', label: 'Settings', icon: IconSettings },
      { id: 'help', label: 'Help', icon: IconHelp },
    ],
  },
]

const PRIMARY_NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items)

export default function App() {
  const [viewHistory, setViewHistory] = useState<ViewHistory>(() => createViewHistory())
  const visibleNav = useMemo(() => PRIMARY_NAV_ITEMS, [])
  const { frame, connected, fps } = useTelemetry()
  const { releaseInfo, installing, dismiss, install } = useUpdateCheck()

  const [booting, setBooting] = useState(true)
  const [splashMounted, setSplashMounted] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)

  const dashEditorRef = useRef<DashEditorHandle>(null)
  const [pendingHistory, setPendingHistory] = useState<ViewHistory | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  const view = viewHistory.current

  const applyHistory = useCallback((nextHistory: ViewHistory) => {
    if (
      nextHistory.current === viewHistory.current &&
      nextHistory.index === viewHistory.index &&
      nextHistory.stack.length === viewHistory.stack.length
    ) {
      return
    }

    if (view === 'dashboards' && dashEditorRef.current?.isDirty) {
      setPendingHistory(nextHistory)
      setShowLeaveConfirm(true)
      return
    }

    setViewHistory(nextHistory)
  }, [view, viewHistory])

  const switchView = useCallback((newView: View) => {
    applyHistory(navigateToView(viewHistory, newView))
  }, [applyHistory, viewHistory])

  const confirmLeave = useCallback(() => {
    setShowLeaveConfirm(false)
    if (pendingHistory) {
      setViewHistory(pendingHistory)
      setPendingHistory(null)
    }
  }, [pendingHistory])

  const cancelLeave = useCallback(() => {
    setShowLeaveConfirm(false)
    setPendingHistory(null)
  }, [])

  useEffect(() => {
    const unsub = onEvent(APP_EVENTS.ready, () => setBooting(false))
    const fallback = setTimeout(() => setBooting(false), 3000)
    return () => {
      unsub()
      clearTimeout(fallback)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === ',') {
        event.preventDefault()
        switchView('settings')
        return
      }

      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }

      const match = /^Digit([1-9])$/.exec(event.code)
      if (!match) {
        return
      }

      const targetView = visibleNav[Number(match[1]) - 1]
      if (!targetView) {
        return
      }

      event.preventDefault()
      switchView(targetView.id as View)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [switchView, visibleNav])

  return (
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      sidebar={
        <NavRail
          collapsed={sidebarCollapsed}
          sections={NAV_SECTIONS}
          activeId={view}
          onSelect={(id) => switchView(id as View)}
          header={
            <SidebarBrand
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
            />
          }
        />
      }
    >
      {splashMounted && (
        <SplashScreen visible={booting} onDone={() => setSplashMounted(false)} />
      )}

      {/* Single content header (Figma "Header", h45): per-view toolbar slot + window controls. */}
      <header
        app-region="drag"
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button, a, input')) return
          void windowAPI.toggleMaximise()
        }}
        className="flex h-[45px] shrink-0 items-center gap-[10px] pl-[14px]"
      >
        <div ref={setHeaderSlot} className="flex min-w-0 flex-1 items-center gap-[14px]" />
        <WindowControls />
      </header>

      {/* Figma "Main": the content column sits in a single shared inset
          (pad 0/14/14/14, plus a small 8px gap under the window-controls header).
          Owning it here means no individual view can forget its page padding. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-[14px] pb-[14px] pt-[8px]">
        <ShellHeaderSlotProvider value={headerSlot}>
          {/* Keyed on the view so each page springs in on navigation (fdrise +
              the gentle overshoot ease). motion-safe → respects reduced-motion. */}
          <div
            key={view}
            className="flex min-h-0 flex-1 flex-col motion-safe:animate-[fdrise_260ms_var(--ease-spring)_both]"
          >
            {view === 'home' && <Home frame={frame} connected={connected} fps={fps} />}
            {view === 'devices' && <Devices />}
            {view === 'dashboards' && <DashEditor ref={dashEditorRef} />}
            {view === 'settings' && <Settings />}
            {view === 'help' && <Help />}
          </div>
        </ShellHeaderSlotProvider>
      </main>

      <ConfirmDialog
        open={showLeaveConfirm}
        title="Discard changes?"
        message="You have unsaved changes that will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />

      <UpdateToast
        releaseInfo={releaseInfo}
        installing={installing}
        onInstall={install}
        onDismiss={dismiss}
      />
    </AppShell>
  )
}
