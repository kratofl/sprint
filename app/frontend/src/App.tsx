import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  Button,
  cn,
  NavRail,
  StatusStrip,
} from '@sprint/ui'
import {
  IconArrowLeft,
  IconArrowRight,
  IconGauge,
  IconHelp,
  IconHome2,
  IconKeyboard,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMinus,
  IconSettings,
  IconSquare,
  IconUsb,
  IconX,
} from '@tabler/icons-react'
import logoIcon from '@/assets/sprint_logo_icon.png'
import Home from '@/views/Home'
import Telemetry from '@/views/Telemetry'
import DashEditor, { type DashEditorHandle } from '@/views/DashEditor'
import Devices from '@/views/Devices'
import Controls from '@/views/Controls'
import Settings from '@/views/Settings'
import Help from '@/views/Help'
import { useTelemetry } from '@/hooks/useTelemetry'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
import SplashScreen from '@/components/SplashScreen'
import { ConfirmDialog } from '@/components/ConfirmDialog'
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
import { appInfoAPI } from '@/lib/settings'
import { windowAPI } from '@/lib/window'
import { onEvent } from '@/lib/wails'

type View = AppView

const NAV = [
  { id: 'home', label: 'HOME', icon: IconHome2 },
  { id: 'telemetry', label: 'LIVE_SESSION', icon: IconGauge },
  { id: 'dash', label: 'DASH_EDITOR', icon: IconLayoutDashboard },
  { id: 'devices', label: 'DEVICES', icon: IconUsb },
  { id: 'controls', label: 'CONTROLS', icon: IconKeyboard },
] as const satisfies ReadonlyArray<{
  id: Extract<View, 'home' | 'telemetry' | 'dash' | 'devices' | 'controls'>
  label: string
  icon: ComponentType<{ className?: string; size?: number }>
}>

export default function App() {
  const [viewHistory, setViewHistory] = useState<ViewHistory>(() => createViewHistory('home'))
  const [navCollapsed, setNavCollapsed] = useState(false)
  const visibleNav = useMemo(
    () => import.meta.env.DEV ? [...NAV] : NAV.filter(item => item.id !== 'telemetry'),
    []
  )
  const { frame, connected, fps } = useTelemetry()
  const { releaseInfo, installing, dismiss, install } = useUpdateCheck()

  const [booting, setBooting] = useState(true)
  const [splashMounted, setSplashMounted] = useState(true)
  const [version, setVersion] = useState('dev')

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

    if (view === 'dash' && dashEditorRef.current?.isDirty) {
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
    appInfoAPI.getVersion().then(setVersion).catch(() => {})
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
      switchView(targetView.id)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [switchView, visibleNav])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden border-t border-border bg-background font-sans text-foreground">
      {splashMounted && (
        <SplashScreen visible={booting} onDone={() => setSplashMounted(false)} />
      )}

      <header
        className="flex h-10 shrink-0 items-center border-b border-border bg-background px-3 [--wails-draggable:drag]"
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button, a, input')) return
          void windowAPI.toggleMaximise()
        }}
      >
        <div className="flex items-center gap-1.5 [--wails-draggable:nodrag]">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={stepBackward}
            disabled={!viewHistory.canGoBack}
            className="text-text-muted hover:bg-foreground/10"
            aria-label="Back"
          >
            <IconArrowLeft size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={stepForward}
            disabled={!viewHistory.canGoForward}
            className="text-text-muted hover:bg-foreground/10"
            aria-label="Forward"
          >
            <IconArrowRight size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setNavCollapsed(value => !value)}
            className="text-text-muted hover:bg-foreground/10"
            aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {navCollapsed ? (
              <IconLayoutSidebarLeftExpand size={14} />
            ) : (
              <IconLayoutSidebarLeftCollapse size={14} />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => switchView('home')}
            className="gap-2 px-2.5 text-foreground hover:bg-foreground/10"
            aria-label="Go to home"
          >
            <img src={logoIcon} alt="Sprint" className="h-4 w-auto shrink-0" />
            <span className="text-[11px] font-semibold tracking-[0.04em]">Sprint</span>
          </Button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1 [--wails-draggable:nodrag]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => switchView('settings')}
            className={cn(
              'gap-1.5 text-text-muted hover:bg-foreground/10 hover:text-foreground',
              view === 'settings' && 'border-border bg-white/[0.04] text-foreground',
            )}
            aria-label="View settings"
          >
            <IconSettings size={14} />
            <span>SETTINGS</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => switchView('help')}
            className={cn(
              'gap-1.5 text-text-muted hover:bg-foreground/10 hover:text-foreground',
              view === 'help' && 'border-border bg-white/[0.04] text-foreground',
            )}
            aria-label="Help"
          >
            <IconHelp size={14} />
            <span>HELP</span>
          </Button>
          <div className="ml-1 flex items-center gap-1 border-l border-border pl-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => { void windowAPI.minimise() }}
              className="text-text-muted hover:bg-foreground/10"
              aria-label="Minimise"
            >
              <IconMinus size={12} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => { void windowAPI.toggleMaximise() }}
              className="text-text-muted hover:bg-foreground/10"
              aria-label="Maximise"
            >
              <IconSquare size={12} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => { void windowAPI.close() }}
              className="text-text-muted hover:bg-destructive/80 hover:text-white"
              aria-label="Close"
            >
              <IconX size={12} />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <NavRail
          items={visibleNav.map(({ id, label, icon }) => ({ id, label, icon }))}
          activeId={view}
          onSelect={(id) => switchView(id as View)}
          collapsed={navCollapsed}
          onCollapsedChange={setNavCollapsed}
          showCollapseToggle={false}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden bg-background">
            {view === 'home' && <Home connected={connected} onNavigate={switchView} />}
            {view === 'telemetry' && <Telemetry frame={frame} />}
            {view === 'dash' && <DashEditor ref={dashEditorRef} />}
            {view === 'devices' && <Devices />}
            {view === 'controls' && <Controls />}
            {view === 'settings' && <Settings />}
            {view === 'help' && <Help />}
          </main>

          <StatusStrip
            connected={connected}
            version={version}
            leftSlot={(
              <>
                <span>FRAME_RATE: {fps ?? 0}Hz</span>
                <span>GAME: {frame?.session.game?.toUpperCase() ?? '——'}</span>
              </>
            )}
          />
        </div>
      </div>

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
    </div>
  )
}
