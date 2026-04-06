import { useEffect, useState, useRef, useCallback } from 'react'
import Home from '@/views/Home'
import Telemetry from '@/views/Telemetry'
import DashEditor, { type DashEditorHandle } from '@/views/DashEditor'
import Devices from '@/views/Devices'
import Controls from '@/views/Controls'
import { useTelemetry } from '@/hooks/useTelemetry'
import SplashScreen from '@/components/SplashScreen'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { onEvent, call } from '@/lib/wails'
import { Badge, Button, cn } from '@sprint/ui'
import logoIcon from '@/assets/sprint_logo_icon.png'
import {
  IconBell,
  IconMinus,
  IconSquare,
  IconX,
} from '@tabler/icons-react'

type View = 'home' | 'telemetry' | 'dash' | 'devices' | 'controls'
type BuildChannel = 'dev' | 'alpha' | 'beta' | 'release'

const NAV: { id: View; label: string }[] = [
  { id: 'home',      label: 'Home' },
  { id: 'telemetry', label: 'Live_Session' },
  { id: 'dash',      label: 'Dash_Editor' },
  { id: 'devices',   label: 'Devices' },
  { id: 'controls',  label: 'Controls' },
]

const CHANNEL_BADGE: Record<BuildChannel, { label: string; variant: 'warning' | 'neutral' | 'active' | 'connected' }> = {
  dev:     { label: 'DEV',     variant: 'warning' },
  alpha:   { label: 'ALPHA',   variant: 'active' },
  beta:    { label: 'BETA',    variant: 'neutral' },
  release: { label: 'RELEASE', variant: 'connected' },
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const visibleNav = import.meta.env.DEV ? NAV : NAV.filter(v => v.id !== 'telemetry') as { id: View; label: string }[]
  const { frame, connected, fps } = useTelemetry()

  const [booting, setBooting] = useState(true)
  const [splashMounted, setSplashMounted] = useState(true)
  const [version, setVersion] = useState('dev')
  const [channel, setChannel] = useState<BuildChannel>('dev')

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
    return () => { unsub(); clearTimeout(fallback) }
  }, [])

  useEffect(() => {
    call<string>('GetVersion').then(setVersion).catch(() => {})
    call<string>('GetBuildChannel').then(v => setChannel(v as BuildChannel)).catch(() => {})
  }, [])

  const channelBadge = CHANNEL_BADGE[channel] ?? CHANNEL_BADGE.dev

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground border-t border-border">
      {splashMounted && (
        <SplashScreen visible={booting} onDone={() => setSplashMounted(false)} />
      )}

      {/* Top app bar — drag region, logo + nav tabs + window controls */}
      <header className="flex h-10 shrink-0 items-center border-b border-border bg-background px-3 [--wails-draggable:drag]">
        {/* Logo */}
        <div className="flex shrink-0 items-center pr-4 [--wails-draggable:nodrag]">
          <img src={logoIcon} alt="Sprint" className="h-5 w-auto object-contain select-none" draggable={false} />
        </div>

        {/* Nav tabs */}
        <nav className="flex items-stretch gap-0.5 h-full [--wails-draggable:nodrag]">
          {visibleNav.map(item => {
            const isActive = item.id === view
            return (
              <button
                key={item.id}
                onClick={() => switchView(item.id)}
                className={cn(
                  'relative flex items-center px-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors duration-100 outline-none',
                  isActive
                    ? 'text-accent after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent'
                    : 'text-text-muted hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Right: notifications + window controls */}
        <div className="ml-auto flex items-center gap-1 [--wails-draggable:nodrag]">
          <Button variant="ghost" size="icon-sm" className="text-text-muted" aria-label="Notifications">
            <IconBell size={15} />
          </Button>
          <div className="flex items-center gap-1 pl-2 border-l border-border">
            <button
              onClick={() => call('WindowMinimise')}
              className="flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-60 hover:opacity-100 hover:bg-foreground/10 transition-opacity"
              aria-label="Minimise"
            >
              <IconMinus size={12} />
            </button>
            <button
              onClick={() => call('WindowMaximise')}
              className="flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-60 hover:opacity-100 hover:bg-foreground/10 transition-opacity"
              aria-label="Maximise"
            >
              <IconSquare size={12} />
            </button>
            <button
              onClick={() => call('WindowClose')}
              className="flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-60 hover:opacity-100 hover:bg-destructive/80 hover:text-white transition-all"
              aria-label="Close"
            >
              <IconX size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden bg-background">
        {view === 'home'      && <Home connected={connected} onNavigate={switchView} />}
        {view === 'telemetry' && <Telemetry frame={frame} />}
        {view === 'dash'      && <DashEditor ref={dashEditorRef} />}
        {view === 'devices'   && <Devices />}
        {view === 'controls'  && <Controls />}
      </main>

      {/* Fixed bottom status footer */}
      <footer className="flex h-6 shrink-0 items-center border-t border-border bg-background px-4 font-mono text-[9px] text-text-muted">
        <div className="flex w-full items-center gap-6">
          <div className="flex items-center gap-2">
            <span className={cn(
              'h-1.5 w-1.5 rounded-full',
              connected ? 'bg-secondary animate-pulse' : 'bg-text-muted',
            )} />
            <Badge variant={connected ? 'connected' : 'neutral'} className="font-mono">
              {connected ? 'UPLINK_STABLE' : 'UPLINK_OFFLINE'}
            </Badge>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex gap-4">
            <span>FRAME_RATE: {fps ?? 0}Hz</span>
            <span>GAME: {frame?.session.game?.toUpperCase() ?? '——'}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="italic tracking-widest opacity-40">SPRINT v{version}</span>
            {channel !== 'release' && (
              <Badge variant={channelBadge.variant} className="terminal-header font-mono text-[9px]">
                {channelBadge.label}
              </Badge>
            )}
          </div>
        </div>
      </footer>
      <ConfirmDialog
        open={showLeaveConfirm}
        title="Discard changes?"
        message="You have unsaved changes that will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />

    </div>
  )
}

