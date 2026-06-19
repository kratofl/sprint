import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppShell,
  BodyTray,
  ConfirmDialog,
  IconButton,
  NavRail,
  Titlebar,
  type NavRailSection,
} from '@sprint/ui'
import {
  IconChevronLeft,
  IconChevronRight,
  IconGauge,
  IconHelp,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMinus,
  IconSettings,
  IconSquare,
  IconUsb,
  IconX,
} from '@tabler/icons-react'
import sprintIconUrl from '@/assets/brand/sprint-icon.svg'
import Home from '@/views/Home'
import DashEditor, { type DashEditorHandle } from '@/views/DashEditor'
import Devices from '@/views/Devices'
import Settings from '@/views/Settings'
import Help from '@/views/Help'
import { useTelemetry } from '@/hooks/useTelemetry'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
import SplashScreen from '@/components/SplashScreen'
import UpdateToast from '@/components/UpdateToast'
import { APP_EVENTS } from '@/lib/desktopEvents'
import {
  createViewHistory,
  goBack,
  goForward,
  navigateToView,
  type AppView,
  type ViewHistory,
} from '@/lib/appShell'
import { windowAPI } from '@/lib/window'
import {
  windowControlCloseButtonClassName,
  windowControlMaximiseButtonClassName,
  windowControlMinimiseButtonClassName,
  windowControlsRailClassName,
} from '@/lib/windowControls'
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
const noDragRegionProps = { 'app-region': 'no-drag' } as const

export default function App() {
  const [viewHistory, setViewHistory] = useState<ViewHistory>(() => createViewHistory())
  const visibleNav = useMemo(() => PRIMARY_NAV_ITEMS, [])
  const { frame, connected, fps } = useTelemetry()
  const { releaseInfo, installing, dismiss, install } = useUpdateCheck()

  const [booting, setBooting] = useState(true)
  const [splashMounted, setSplashMounted] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const dashEditorRef = useRef<DashEditorHandle>(null)
  const [pendingHistory, setPendingHistory] = useState<ViewHistory | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  const view = viewHistory.current
  const currentLabel = PRIMARY_NAV_ITEMS.find((item) => item.id === view)?.label ?? 'Home'
  const demoTelemetryActive = !frame && !connected
  const titlebarConnected = connected || demoTelemetryActive
  const titlebarFps = fps || (demoTelemetryActive ? 60 : 0)

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

  const stepBackward = useCallback(() => {
    applyHistory(goBack(viewHistory))
  }, [applyHistory, viewHistory])

  const stepForward = useCallback(() => {
    applyHistory(goForward(viewHistory))
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
      titlebar={
        <Titlebar
          app-region="drag"
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).closest('button, a, input')) return
            void windowAPI.toggleMaximise()
          }}
          logo={<img src={sprintIconUrl} alt="Sprint" className="size-5 rounded-[6px]" draggable={false} />}
          navigation={
            <>
              <IconButton
                {...noDragRegionProps}
                label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-pressed={sidebarCollapsed}
                variant="ghost"
                size="icon-sm"
                className="size-[27px] border-transparent text-[var(--text3)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
                icon={sidebarCollapsed ? <IconLayoutSidebarLeftExpand size={15} /> : <IconLayoutSidebarLeftCollapse size={15} />}
                onClick={() => setSidebarCollapsed(current => !current)}
              />
              <IconButton
                {...noDragRegionProps}
                label="Back"
                variant="ghost"
                size="icon-sm"
                disabled={!viewHistory.canGoBack}
                className="size-[27px] border-transparent text-[var(--text3)] hover:bg-[var(--panel2)] hover:text-[var(--text)] disabled:opacity-30"
                icon={<IconChevronLeft size={15} />}
                onClick={stepBackward}
              />
              <IconButton
                {...noDragRegionProps}
                label="Forward"
                variant="ghost"
                size="icon-sm"
                disabled={!viewHistory.canGoForward}
                className="size-[27px] border-transparent text-[var(--text3)] hover:bg-[var(--panel2)] hover:text-[var(--text)] disabled:opacity-30"
                icon={<IconChevronRight size={15} />}
                onClick={stepForward}
              />
            </>
          }
          breadcrumb={
            <div className="ml-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text3)]">
              <span>SPRINT TELEMETRY</span>
              <span className="text-[var(--line2)]">/</span>
              <span className="text-[var(--text)]">{currentLabel}</span>
            </div>
          }
          status={
            <div
              {...noDragRegionProps}
              className="flex h-[24px] items-center gap-2 rounded-[999px] border border-[var(--line2)] bg-[var(--panel2)] px-3 text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--text2)]"
            >
              <span
                aria-hidden="true"
                className={
                  titlebarConnected
                    ? 'size-1.5 rounded-full bg-[var(--green)] animate-[fdpulse_1.2s_ease-in-out_infinite]'
                    : 'size-1.5 rounded-full bg-[var(--red)]'
                }
              />
              <span>{titlebarConnected ? demoTelemetryActive ? 'SIM DEMO' : 'Assetto Corsa' : 'NO SIGNAL'}</span>
            </div>
          }
          metrics={<span className="text-[10px] font-semibold tabular-nums text-[var(--text3)]">{titlebarFps}Hz</span>}
          windowControls={
            <div className={windowControlsRailClassName}>
              <button
                type="button"
                app-region="no-drag"
                onClick={() => { void windowAPI.minimise() }}
                aria-label="Minimise"
                className={windowControlMinimiseButtonClassName}
              >
                <IconMinus size={10} />
              </button>
              <button
                type="button"
                app-region="no-drag"
                onClick={() => { void windowAPI.toggleMaximise() }}
                aria-label="Maximise"
                className={windowControlMaximiseButtonClassName}
              >
                <IconSquare size={10} />
              </button>
              <button
                type="button"
                app-region="no-drag"
                onClick={() => { void windowAPI.close() }}
                aria-label="Close"
                className={windowControlCloseButtonClassName}
              >
                <IconX size={11} />
              </button>
            </div>
          }
        />
      }
      sidebar={
        <NavRail
          collapsed={sidebarCollapsed}
          sections={NAV_SECTIONS}
          activeId={view}
          onSelect={(id) => switchView(id as View)}
        />
      }
    >
      {splashMounted && (
        <SplashScreen visible={booting} onDone={() => setSplashMounted(false)} />
      )}

      <BodyTray>
        {view === 'home' && <Home frame={frame} connected={connected} fps={fps} />}
        {view === 'devices' && <Devices />}
        {view === 'dashboards' && <DashEditor ref={dashEditorRef} />}
        {view === 'settings' && <Settings />}
        {view === 'help' && <Help />}
      </BodyTray>

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
