import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  Button,
  cn,
  NavRail,
  StatusStrip,
} from '@sprint/ui'
import {
  IconGauge,
  IconHome2,
  IconKeyboard,
  IconLayoutDashboard,
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
import { useTelemetry } from '@/hooks/useTelemetry'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
import SplashScreen from '@/components/SplashScreen'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import UpdateToast from '@/components/UpdateToast'
import { onEvent, call } from '@/lib/wails'

type View = 'home' | 'telemetry' | 'dash' | 'devices' | 'controls' | 'settings'

const NAV = [
  { id: 'home', label: 'HOME', icon: IconHome2 },
  { id: 'telemetry', label: 'LIVE_SESSION', icon: IconGauge },
  { id: 'dash', label: 'DASH_EDITOR', icon: IconLayoutDashboard },
  { id: 'devices', label: 'DEVICES', icon: IconUsb },
  { id: 'controls', label: 'CONTROLS', icon: IconKeyboard },
] as const satisfies ReadonlyArray<{
  id: View
  label: string
  icon: ComponentType<{ className?: string; size?: number }>
}>

export default function App() {
  const [view, setView] = useState<View>('home')
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
  const [pendingView, setPendingView] = useState<View | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  const switchView = useCallback((newView: View) => {
    if (newView === view) return
    if (view === 'dash' && dashEditorRef.current?.isDirty) {
      setPendingView(newView)
      setShowLeaveConfirm(true)
      return
    }
    setView(newView)
  }, [view])

  const confirmLeave = useCallback(() => {
    setShowLeaveConfirm(false)
    if (pendingView) {
      setView(pendingView)
      setPendingView(null)
    }
  }, [pendingView])

  const cancelLeave = useCallback(() => {
    setShowLeaveConfirm(false)
    setPendingView(null)
  }, [])

  useEffect(() => {
    const unsub = onEvent('app:ready', () => setBooting(false))
    const fallback = setTimeout(() => setBooting(false), 3000)
    return () => {
      unsub()
      clearTimeout(fallback)
    }
  }, [])

  useEffect(() => {
    call<string>('GetVersion').then(setVersion).catch(() => {})
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
        className="flex h-8 shrink-0 items-center border-b border-border bg-background px-3 [--wails-draggable:drag]"
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button, a, input')) return
          call('WindowMaximise')
        }}
      >
        <div className="flex items-center gap-2 [--wails-draggable:nodrag]">
          <img src={logoIcon} alt="Sprint" className="h-5 w-auto" />
        </div>

        <div className="ml-auto flex items-center gap-1 [--wails-draggable:nodrag]">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => switchView('settings')}
            className={cn(
              'text-text-muted hover:bg-foreground/10',
              view === 'settings' && 'text-foreground',
            )}
            aria-label="Settings"
          >
            <IconSettings size={14} />
          </Button>
          <div className="flex items-center gap-1 border-l border-border pl-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => call('WindowMinimise')}
              className="text-text-muted hover:bg-foreground/10"
              aria-label="Minimise"
            >
              <IconMinus size={12} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => call('WindowMaximise')}
              className="text-text-muted hover:bg-foreground/10"
              aria-label="Maximise"
            >
              <IconSquare size={12} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => call('WindowClose')}
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
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden bg-background">
            {view === 'home' && <Home connected={connected} onNavigate={switchView} />}
            {view === 'telemetry' && <Telemetry frame={frame} />}
            {view === 'dash' && <DashEditor ref={dashEditorRef} />}
            {view === 'devices' && <Devices />}
            {view === 'controls' && <Controls />}
            {view === 'settings' && <Settings />}
          </main>

          <StatusStrip
            connected={connected}
            version={version}
            leftSlot={
              <>
                <span>FRAME_RATE: {fps ?? 0}Hz</span>
                <span>GAME: {frame?.session.game?.toUpperCase() ?? '——'}</span>
              </>
            }
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
