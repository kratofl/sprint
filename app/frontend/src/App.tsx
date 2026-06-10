import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, NavRail, type NavRailSection } from '@sprint/ui'
import {
  IconArrowLeft,
  IconGauge,
  IconHelp,
  IconLayoutDashboard,
  IconMinus,
  IconSettings,
  IconSquare,
  IconUsb,
  IconX,
} from '@tabler/icons-react'
import wallpaperUrl from '@/assets/brand/sprint-wallpaper.png'
import Telemetry from '@/views/Telemetry'
import DashEditor, { type DashEditorHandle } from '@/views/DashEditor'
import Devices from '@/views/Devices'
import Settings from '@/views/Settings'
import Help from '@/views/Help'
import { useTelemetry } from '@/hooks/useTelemetry'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
import SplashScreen from '@/components/SplashScreen'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import UpdateToast from '@/components/UpdateToast'
import { PageTabs } from '@/components/PageTabs'
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
type ShellView = Extract<View, 'telemetry' | 'dash' | 'devices' | 'settings' | 'help'>

const NAV_SECTIONS: NavRailSection[] = [
  { label: 'Developer', items: [{ id: 'telemetry', label: 'Dashboard', icon: IconGauge }] },
  {
    label: 'Configure',
    items: [
      { id: 'dash', label: 'Dash Editor', icon: IconLayoutDashboard },
      { id: 'devices', label: 'Devices', icon: IconUsb },
    ],
  },
  {
    label: 'System',
    pinned: 'bottom',
    items: [
      { id: 'settings', label: 'Settings', icon: IconSettings },
      { id: 'help', label: 'Help', icon: IconHelp },
    ],
  },
]

const PRIMARY_NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items)

const VIEW_META: Record<ShellView, { title: string; primary: string | null }> = {
  telemetry: { title: 'Developer / Dashboard', primary: 'Pause' },
  dash: { title: 'Configure / Dash Editor', primary: 'Save' },
  devices: { title: 'Configure / Devices', primary: 'Scan' },
  settings: { title: 'System / Settings', primary: 'Save' },
  help: { title: 'System / Help', primary: null },
}

export default function App() {
  const [viewHistory, setViewHistory] = useState<ViewHistory>(() => createViewHistory())
  const visibleNav = useMemo(() => PRIMARY_NAV_ITEMS, [])
  const { frame } = useTelemetry()
  const { releaseInfo, installing, dismiss, install } = useUpdateCheck()

  const [booting, setBooting] = useState(true)
  const [splashMounted, setSplashMounted] = useState(true)

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

  const currentView = view in VIEW_META ? view as ShellView : 'dash'
  const currentMeta = VIEW_META[currentView]

  return (
    <div
      className="min-h-screen overflow-hidden bg-cover bg-center p-4 font-inter text-[var(--text)]"
      style={{ backgroundImage: `url(${wallpaperUrl})` }}
    >
      {splashMounted && (
        <SplashScreen visible={booting} onDone={() => setSplashMounted(false)} />
      )}

      <div className="mx-auto flex h-[883px] w-[1570px] max-w-full origin-top-left flex-col overflow-hidden rounded-panel border border-[var(--win-edge)] bg-[var(--win)] shadow-[0_4px_2px_rgba(0,0,0,.14),0_8px_16px_rgba(0,0,0,.14)]">
        <header
          className="flex h-8 shrink-0 items-center gap-2 px-[14px] [--wails-draggable:drag]"
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).closest('button, a, input')) return
            void windowAPI.toggleMaximise()
          }}
        >
          <div className="flex size-5 items-center justify-center rounded-tile bg-[var(--orange)] font-space text-[13px] font-bold text-[var(--panel)]">
            S
          </div>
          <span className="font-inter text-[13px] font-bold text-white">Sprint</span>
          <span className="font-inter text-[13px] text-[var(--muted)]">- Telemetry System</span>
          <div className="flex-1" />
          <div className={windowControlsRailClassName}>
            <button
              type="button"
              onClick={() => { void windowAPI.minimise() }}
              aria-label="Minimise"
              className={windowControlMinimiseButtonClassName}
            >
              <IconMinus size={10} />
            </button>
            <button
              type="button"
              onClick={() => { void windowAPI.toggleMaximise() }}
              aria-label="Maximise"
              className={windowControlMaximiseButtonClassName}
            >
              <IconSquare size={10} />
            </button>
            <button
              type="button"
              onClick={() => { void windowAPI.close() }}
              aria-label="Close"
              className={windowControlCloseButtonClassName}
            >
              <IconX size={11} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[220px] shrink-0 flex-col justify-between gap-[14px] p-[10px]">
            <NavRail
              sections={NAV_SECTIONS}
              activeId={view}
              onSelect={(id) => switchView(id as View)}
            />
          </aside>

          <section className="flex min-w-0 flex-1 flex-col gap-[14px] rounded-panel border border-[var(--border)] bg-[var(--bg)] p-[14px]">
            <div className="flex h-[41px] shrink-0 items-center gap-2 rounded-panel border border-[var(--border)] bg-[var(--panel)] px-2 py-1">
              <button
                type="button"
                onClick={stepBackward}
                disabled={!viewHistory.canGoBack}
                className="flex size-[21px] items-center justify-center rounded-tile bg-[var(--panel-2)] text-[var(--muted)] disabled:opacity-40"
                aria-label="Back"
              >
                <IconArrowLeft size={13} />
              </button>
              <span className="font-saira text-[11px] text-white">{currentMeta.title}</span>
              <PageTabs activeView={currentView} onSelect={switchView} />
              <div className="ml-auto flex items-center gap-1">
                <Button variant="secondary" size="sm" onClick={stepForward} disabled={!viewHistory.canGoForward}>
                  Forward
                </Button>
                {currentMeta.primary ? (
                  <Button variant="primary" size="sm">
                    {currentMeta.primary}
                  </Button>
                ) : null}
              </div>
            </div>

            <main className="min-h-0 flex-1 overflow-hidden">
              {view === 'telemetry' && <Telemetry frame={frame} />}
              {view === 'dash' && <DashEditor ref={dashEditorRef} />}
              {view === 'devices' && <Devices />}
              {view === 'settings' && <Settings />}
              {view === 'help' && <Help />}
            </main>
          </section>
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
