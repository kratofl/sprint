import { useCallback, useEffect, useState } from 'react'
import { bridge, type AppView, type ResultsImportOffer, type SprintCommand } from './bridge'
import type { RuntimeState } from './shell/runtime'
import { TitleBar } from './shell/TitleBar'
import { Sidebar } from './shell/Sidebar'
import { ViewRouter, type NavigationTarget } from './shell/ViewRouter'
import { CommandPalette } from './shell/CommandPalette'
import { ToastHost } from './shell/ToastHost'
import { ImportResultsDialog } from './shell/ImportResultsDialog'
import { useToasts } from './shell/useToasts'
import { buildShellCommands } from './shell/commands'
import { primaryNav } from './shell/nav'
import { readDriverName, readSidebarCollapsed, readWebAppUrl } from './shell/settings'
import { parseUpdateCheck, displayVersion, type UpdateRelease } from './shell/updates'
import { canGoBack, goBack, initialHistory, navigateTo } from './shell/history'

export type { RuntimeState }

// Physical Alt+1..7 keys, matching both the digit row and numpad (old app:
// `TryProductionShortcutView` supported both). Index maps 1:1 onto
// `shell/nav.ts`'s `primaryNav` order.
const ALT_DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7']
const ALT_NUMPAD_CODES = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad7']

export function App() {
  // Current page plus the pages visited before it (title-bar back, Alt+Left).
  const [history, setHistory] = useState(() => initialHistory('Home'))
  const view = history.view
  // A pending "open this specific item" request from Home (dash card, device
  // row, plan tile). Cleared right after being handed to the target view
  // (below) so it is applied exactly once: the view consumes it on mount to
  // seed its own selection, and a later plain navigation back to the same
  // page (sidebar, palette, Alt shortcut) never re-forces it.
  const [focus, setFocus] = useState<NavigationTarget | null>(null)
  // Unknown until the persisted setting loads, so the shell never paints the
  // wrong sidebar width and then snaps (old app: `SidebarCollapsed` restore).
  const [collapsed, setCollapsed] = useState<boolean | null>(null)
  const [runtime, setRuntime] = useState<RuntimeState>({ kind: 'loading' })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [updateRelease, setUpdateRelease] = useState<UpdateRelease | null>(null)
  // The results import dialog (#185). `offered` is the startup scan's proposal; null means the
  // dialog was opened by hand and searches for itself.
  const [importDialog, setImportDialog] = useState<{ offered: ResultsImportOffer | null } | null>(null)
  const { toasts, leaving, show: showToast, dismiss: dismissToast } = useToasts()

  // Every page change goes through here so the back stack stays complete.
  const navigate = useCallback((next: AppView) => setHistory((current) => navigateTo(current, next)), [])
  const back = useCallback(() => setHistory(goBack), [])

  useEffect(() => {
    bridge
      .getState()
      .then((sprint) => {
        setRuntime({ kind: 'ready', sprint })
        setCollapsed((current) => current ?? readSidebarCollapsed(sprint.settings))
      })
      .catch((error: unknown) => {
        console.error('Initial state load failed', error)
        // Still resolve "unknown" so the shell becomes visible rather than staying blank forever.
        setCollapsed((current) => current ?? false)
      })
    return bridge.subscribe((sprint) => setRuntime({ kind: 'ready', sprint }))
  }, [])

  // Returns the bridge's promise so a view can await and react to a failure
  // (e.g. show a banner). Callers that don't care about the result can still
  // fire-and-forget with `void send(...)` — the failure is never swallowed
  // silently because it is always logged here first.
  const send = useCallback((command: SprintCommand): Promise<void> => {
    const result = bridge.sendCommand(command)
    result.catch((error: unknown) => console.error('Command failed', command, error))
    return result
  }, [])

  // Navigates to a view and asks it to open one specific item, instead of just
  // switching pages (old app: dash card / device row / plan tile opened the
  // item directly). See the `focus` clearing effect below for the "applies once" half.
  const openItem = useCallback((target: NavigationTarget) => {
    navigate(target.view)
    setFocus(target)
  }, [navigate])

  // Hands `focus` off for exactly one render, then clears it. The target view
  // reads it on mount (its own effect, keyed on the id) before this fires, so
  // the hand-off is invisible; anything after — including a remount from
  // navigating away and back — sees `focus: null` and behaves as today.
  useEffect(() => {
    if (focus !== null) setFocus(null)
  }, [focus])

  const toggleSidebar = useCallback(() => {
    setCollapsed((current) => {
      const next = !(current ?? false)
      void send({ type: 'settings.update', sidebarCollapsed: next })
      return next
    })
  }, [send])

  // Shared by the startup check and the palette's manual "Check for updates"
  // (old app: `NotifyIfUpdateAvailableAsync`). `force` only affects whether a
  // silent "up to date" result also gets a toast — a background check must
  // never nag, but an explicit user action deserves an answer either way.
  const runUpdateCheck = useCallback(
    async (force: boolean) => {
      try {
        const result = await bridge.checkUpdates(force)
        const release = parseUpdateCheck(result)
        if (release) {
          setUpdateRelease(release)
          showToast({
            tone: 'info',
            title: `Sprint ${displayVersion(release.version)} is available`,
            message: 'Install it from Settings.',
            action: { label: 'Open Settings', onClick: () => navigate('Settings') },
          })
        } else if (force) {
          showToast({ tone: 'info', title: "You're up to date", message: 'Sprint is already on the latest version for your update channel.' })
        }
      } catch (error) {
        console.error('Update check failed', error)
        if (force) showToast({ tone: 'danger', title: 'Could not check for updates', message: 'Try again later.' })
      }
    },
    [showToast, navigate],
  )

  // One check at startup only.
  useEffect(() => {
    void runUpdateCheck(false)
  }, [runUpdateCheck])

  // The startup import offer (old app: `OfferArchivedSessionsAsync`): prompts only when the
  // results archive holds sessions that are neither imported nor previously declined. Nothing is
  // imported without the driver's answer. A dialog the driver already opened by hand wins.
  useEffect(() => {
    let live = true
    bridge
      .resultsImportScan(false)
      .then((offer) => {
        if (live && offer.entries.length > 0) setImportDialog((current) => current ?? { offered: offer })
      })
      .catch((error: unknown) => console.error('Results import scan failed', error))
    return () => {
      live = false
    }
  }, [])

  // The manual action re-offers declined sessions: "Not now" silenced a prompt, not the laps.
  const scanForImport = useCallback(() => bridge.resultsImportScan(true), [])
  const importSource = runtime.kind === 'ready' ? runtime.sprint.resultsImport : null
  const openImport = useCallback(() => setImportDialog({ offered: null }), [])
  const importResults = importSource?.available ? openImport : undefined

  // Ctrl+K, Alt+1..7, Alt+Left (back), and Escape for the topmost transient surface (palette,
  // then the newest toast). Views own their own dialogs, so Escape never
  // reaches into ViewRouter's children.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (event.key === 'Escape') {
        if (paletteOpen) {
          setPaletteOpen(false)
          return
        }
        const topmost = toasts[toasts.length - 1]
        if (topmost) dismissToast(topmost.id)
        return
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          back()
          return
        }
        const digitIndex = ALT_DIGIT_CODES.indexOf(event.code)
        const numpadIndex = ALT_NUMPAD_CODES.indexOf(event.code)
        const index = digitIndex >= 0 ? digitIndex : numpadIndex
        const target = index >= 0 ? primaryNav[index] : undefined
        if (target) {
          event.preventDefault()
          navigate(target.view)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteOpen, toasts, dismissToast, navigate, back])

  const webAppUrl = runtime.kind === 'ready' ? readWebAppUrl(runtime.sprint.settings) : null
  const driverName = runtime.kind === 'ready' ? readDriverName(runtime.sprint.settings) : null
  const commands = buildShellCommands({
    navigate,
    send,
    toggleSidebar,
    checkForUpdates: () => void runUpdateCheck(true),
    importResults,
  })

  const appClassName = ['app', collapsed === null ? 'pending' : 'ready', collapsed ? 'collapsed' : ''].filter(Boolean).join(' ')

  return (
    <div className={appClassName}>
      <TitleBar canGoBack={canGoBack(history)} onBack={back} runtime={runtime} onOpenPalette={() => setPaletteOpen(true)} />
      <div className="app-frame">
        <Sidebar
          view={view}
          collapsed={collapsed ?? false}
          onToggleCollapsed={toggleSidebar}
          onSelect={navigate}
          webAppUrl={webAppUrl}
          driverName={driverName}
          updateAvailable={updateRelease !== null}
        />
        <main className="content">
          <ViewRouter
            view={view}
            focus={focus}
            runtime={runtime}
            send={send}
            onNavigate={navigate}
            onOpenItem={openItem}
            onImportResults={importResults}
          />
        </main>
      </div>
      {paletteOpen ? <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} /> : null}
      {importDialog ? (
        <ImportResultsDialog
          sourceName={importSource?.available ? importSource.sourceName : 'the results archive'}
          offered={importDialog.offered}
          scan={scanForImport}
          runImport={bridge.resultsImport}
          decline={bridge.resultsImportDecline}
          onClose={() => setImportDialog(null)}
        />
      ) : null}
      <ToastHost toasts={toasts} leaving={leaving} onDismiss={dismissToast} />
    </div>
  )
}
