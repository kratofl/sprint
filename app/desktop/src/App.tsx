import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DashColoursContext, DashUnitsContext, defaultDashColours } from '@sprint/dashboard'
import { bridge, type AppView, type ResultsImportOffer, type SprintCommand, type UpdateStatus } from './bridge'
import type { RuntimeState } from './shell/runtime'
import { TitleBar } from './shell/TitleBar'
import { Rail } from './shell/Rail'
import { ExplorerContext, ExplorerPane } from './shell/Explorer'
import { StatusBar } from './shell/StatusBar'
import { ViewRouter, type NavigationTarget } from './shell/ViewRouter'
import { CommandPalette } from './shell/CommandPalette'
import { ToastHost } from './shell/ToastHost'
import { ImportResultsDialog } from './shell/ImportResultsDialog'
import { FirstRun } from './firstRun/FirstRun'
import type { FirstRunActions } from './firstRun/FirstRun'
import { parseSettings } from './views/SettingsDomain'
import { useColourTheme } from './shell/useColourTheme'
import { AccountDialog } from './shell/AccountDialog'
import { Onboarding } from './onboarding/Onboarding'
import { localCounts } from './onboarding/summary'
import { useToasts } from './shell/useToasts'
import { buildShellCommands } from './shell/commands'
import { areaOf, crumbsFor, explorerPinned, hasExplorer, primaryNav, type NavArea } from './shell/nav'
import { matchShortcut } from './shell/shortcuts'
import { platform } from './platform'
import { readSidebarCollapsed } from './shell/settings'
import { PageUpContext, type PageUp } from './shell/pageUp'
import { currentBuild } from './shell/BuildMark'
import { ToolbarActionsContext, type ToolbarActions } from './shell/toolbarActions'

export type { RuntimeState }

/**
 * The main window. `mockup` (preview build only, mockup/MockupRoot.tsx) opens on its page and
 * shows its content there in place of the real view; every other page stays the real one.
 */
export function App({ mockup }: { mockup?: { view: AppView; content: ReactNode } } = {}) {
  const [view, setView] = useState<AppView>(mockup?.view ?? 'Home')
  // The page above the current one, registered by the view (shell/pageUp.ts): where
  // Alt+Left / ⌘[ goes. Null on a top-level page.
  const [up, setUp] = useState<PageUp | null>(null)
  // A pending "open this specific item" request from Home (dash card, device
  // row, plan tile). Cleared right after being handed to the target view
  // (below) so it is applied exactly once: the view consumes it on mount to
  // seed its own selection, and a later plain navigation back to the same
  // page (rail, page tab, palette, Alt shortcut) never re-forces it.
  const [focus, setFocus] = useState<NavigationTarget | null>(null)
  // Whether the explorer is hidden (the persisted `sidebarCollapsed` setting). Unknown until it
  // loads, so the shell never paints the wrong width and then snaps.
  const [collapsed, setCollapsed] = useState<boolean | null>(null)
  // The explorer's body, which the page's list renders into (shell/Explorer.tsx); null while there is none.
  const [explorerBody, setExplorerBody] = useState<HTMLElement | null>(null)
  // The page last open in each area, where pressing the area in the rail goes back to.
  const lastInArea = useRef<Partial<Record<NavArea['id'], AppView>>>({})
  const [runtime, setRuntime] = useState<RuntimeState>({ kind: 'loading' })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  // The Sprint web setup: on the first launch, or to connect later (Settings, the account row).
  const [setup, setSetup] = useState<'first-run' | 'connect' | null>(null)
  const firstRunChecked = useRef(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: 'idle' })
  // The results import dialog (#185). `offered` is the startup scan's proposal; null means the
  // dialog was opened by hand and searches for itself.
  const [importDialog, setImportDialog] = useState<{ offered: ResultsImportOffer | null } | null>(null)
  const { toasts, leaving, show: showToast, dismiss: dismissToast } = useToasts()

  const navigate = useCallback((next: AppView) => setView(next), [])
  useEffect(() => {
    lastInArea.current[areaOf(view).id] = view
  }, [view])
  const openArea = useCallback((area: NavArea) => navigate(lastInArea.current[area.id] ?? area.views[0]), [navigate])

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

  // A dash designer's "Alerts and Ack" brings this window forward on Dashes > Settings.
  useEffect(() => bridge.subscribeOpenDashSettings(() => openItem({ view: 'Dashes', settings: true })), [openItem])

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

  // The main process checks at launch and every hour after; an update on offer shows as the
  // toolbar's update button, not a toast. A check the driver asked for from the palette also
  // answers "up to date" or "couldn't check", and an install the driver started says when it
  // failed; a background check never nags.
  const manualCheck = useRef(false)
  const announcedKind = useRef<UpdateStatus['kind'] | null>(null)
  useEffect(
    () =>
      bridge.subscribeUpdates((status) => {
        setUpdateStatus(status)
        // A resubscribe repeats the current status; only a change is news.
        const previous = announcedKind.current
        if (previous === status.kind) return
        announcedKind.current = status.kind
        const manual = manualCheck.current
        if (status.kind !== 'checking') manualCheck.current = false
        if (status.kind === 'up-to-date' && manual) {
          showToast({ tone: 'info', title: "You're up to date", message: 'Sprint is already on the latest version for your update channel.' })
        } else if (status.kind === 'failed' && manual) {
          showToast({ tone: 'danger', title: 'Could not check for updates', message: 'Try again later.' })
        } else if (status.kind === 'failed' && (previous === 'downloading' || previous === 'installing')) {
          showToast({ tone: 'danger', title: 'Could not update Sprint', message: 'Try again later.' })
        }
      }),
    [showToast],
  )
  const checkForUpdates = useCallback(() => {
    if (updateStatus.kind === 'unsupported') {
      showToast({ tone: 'info', title: 'Updates need the installed app', message: 'This build of Sprint does not update itself.' })
      return
    }
    manualCheck.current = true
    void bridge.checkUpdates()
  }, [updateStatus.kind, showToast])

  // The startup import offer (old app: `OfferArchivedSessionsAsync`): prompts only when the
  // results archive holds sessions that are neither imported nor previously declined. Nothing is
  // imported without the driver's answer. A dialog the driver already opened by hand wins.
  // Not during the first-run setup, which asks the same question as one of its steps.
  const firstRunDone = runtime.kind === 'ready' && runtime.sprint.firstRun.done
  useEffect(() => {
    if (!firstRunDone) return
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
  }, [firstRunDone])

  // The manual action re-offers declined sessions: "Not now" silenced a prompt, not the laps.
  const scanForImport = useCallback(() => bridge.resultsImportScan(true), [])
  const importSource = runtime.kind === 'ready' ? runtime.sprint.resultsImport : null
  const openImport = useCallback(() => setImportDialog({ offered: null }), [])
  const importResults = importSource?.available ? openImport : undefined

  // The palette, page and back shortcuts (Ctrl+K / Alt+1..8 / Alt+Left on Windows, ⌘K / ⌘1..8 /
  // ⌘[ on macOS; shell/shortcuts.ts), and Escape for the topmost transient surface (palette, then
  // the newest toast). Views own their own dialogs, so Escape never reaches into ViewRouter's children.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (paletteOpen) {
          setPaletteOpen(false)
          return
        }
        const topmost = toasts[toasts.length - 1]
        if (topmost) dismissToast(topmost.id)
        return
      }
      const shortcut = matchShortcut(platform, event)
      if (!shortcut) return
      if (shortcut.kind === 'palette') {
        event.preventDefault()
        setPaletteOpen(true)
      } else if (shortcut.kind === 'back') {
        event.preventDefault()
        up?.go()
      } else {
        const target = primaryNav[shortcut.index]
        if (target) {
          event.preventDefault()
          navigate(target.view)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteOpen, toasts, dismissToast, navigate, up])

  const account = runtime.kind === 'ready' ? runtime.sprint.account : null
  // Every dash picture in the window prints in the driver's units and colours (DashCanvas reads
  // them); the app's own cold-to-hot values take the colour theme from <html data-colours>.
  const appSettings = runtime.kind === 'ready' ? parseSettings(runtime.sprint.settings) : null
  const units = appSettings?.units ?? 'Metric'
  const colours = appSettings?.colours ?? defaultDashColours
  useColourTheme(colours.theme)
  // Off (the shipped default), Sprint web shows nowhere: no setup, no account row, no Settings group.
  const sprintWeb = runtime.kind === 'ready' && runtime.sprint.features.sprintWeb
  const build = currentBuild(runtime.kind === 'ready' ? runtime.sprint : null)

  // Asked once, on the first state that says the setup was never answered.
  useEffect(() => {
    if (runtime.kind !== 'ready' || firstRunChecked.current) return
    firstRunChecked.current = true
    if (runtime.sprint.features.sprintWeb && !runtime.sprint.cloud.setupDone) setSetup('first-run')
  }, [runtime])
  const onboardingActions = useMemo(
    () => ({
      send,
      discover: bridge.discoverServers,
      signIn: bridge.signIn,
      signInWithDiscord: bridge.signInWithDiscord,
      cancelDiscordSignIn: bridge.cancelDiscordSignIn,
      serverInfo: bridge.serverInfo,
      upload: bridge.syncUp,
    }),
    [send],
  )
  const openSetup = useCallback(() => {
    setAccountOpen(false)
    setSetup('connect')
  }, [])
  const commands = buildShellCommands({
    platform,
    navigate,
    send,
    toggleSidebar,
    checkForUpdates,
    newDash: () => openItem({ view: 'Dashes', newDash: true }),
    importResults,
    // A build-time constant: every build but a dev run drops the command.
    openDebugWindow: import.meta.env.DEV ? () => void bridge.openDebugWindow() : undefined,
  })

  // The toolbar slot the page's actions render into, and the room it has for them. Null until
  // the toolbar mounts, so PageHeader keeps its CommandBar in the content until then.
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)
  const [actionsRoom, setActionsRoom] = useState<{ measure: () => number } | null>(null)
  const toolbarActions = useMemo<ToolbarActions | null>(
    () => (actionsSlot && actionsRoom ? { slot: actionsSlot, measureRoom: actionsRoom.measure } : null),
    [actionsSlot, actionsRoom],
  )
  const openDiagnostics = useCallback(() => navigate('Help'), [navigate])
  const openDevice = useCallback((deviceId: string) => openItem({ view: 'Devices', deviceId }), [openItem])
  const firstRunActions = useMemo<FirstRunActions>(
    () => ({ send, pickFolder: bridge.pickFolder, scan: () => bridge.resultsImportScan(false), runImport: bridge.resultsImport, decline: bridge.resultsImportDecline }),
    [send],
  )

  // Until the first-run setup is done it is the whole window: no shell behind it to reach.
  if (runtime.kind === 'ready' && !runtime.sprint.firstRun.done) {
    const settings = parseSettings(runtime.sprint.settings)
    return (
      <FirstRun
        firstRun={runtime.sprint.firstRun}
        importAvailable={runtime.sprint.resultsImport.available}
        driverName={settings.driverName}
        driverNumber={settings.driverNumber}
        actions={firstRunActions}
      />
    )
  }

  const explorerShown = collapsed !== true || explorerPinned(view)

  return (
    <div className={collapsed === null ? 'app pending' : 'app ready'}>
      <Rail view={view} build={build} onSelect={openArea} updateAvailable={updateStatus.kind === 'available'} />
      {explorerShown ? <ExplorerPane view={view} onSelect={navigate} bodyRef={setExplorerBody} /> : null}
      <TitleBar
        onOpenPalette={() => setPaletteOpen(true)}
        crumbs={crumbsFor(view)}
        explorer={hasExplorer(view) && !explorerPinned(view) ? { shown: explorerShown, onToggle: toggleSidebar } : null}
        pages={!explorerShown && areaOf(view).views.length > 1 ? { views: areaOf(view).views, current: view, onSelect: navigate } : null}
        onActionsSlot={setActionsSlot}
        onActionsRoom={setActionsRoom}
        update={updateStatus}
        onInstallUpdate={() => void bridge.installUpdate()}
      />
      <main className="content">
        <ExplorerContext value={explorerShown ? explorerBody : null}>
          <ToolbarActionsContext value={toolbarActions}>
            <PageUpContext value={setUp}>
              <DashUnitsContext value={units}>
                <DashColoursContext value={colours}>
                {mockup && view === mockup.view ? (
                  mockup.content
                ) : (
                  <ViewRouter
                    view={view}
                    focus={focus}
                    runtime={runtime}
                    send={send}
                    onNavigate={navigate}
                    onOpenItem={openItem}
                    onImportResults={importResults}
                    onSetUpCloud={openSetup}
                    updateStatus={updateStatus}
                  />
                )}
                </DashColoursContext>
              </DashUnitsContext>
            </PageUpContext>
          </ToolbarActionsContext>
        </ExplorerContext>
      </main>
      <StatusBar
        sprint={runtime.kind === 'ready' ? runtime.sprint : null}
        build={build}
        account={sprintWeb ? { account, onOpen: () => (account?.signedIn ? setAccountOpen(true) : openSetup()) } : null}
        onOpenDiagnostics={openDiagnostics}
        onOpenDevice={openDevice}
      />
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
      {sprintWeb && accountOpen && account?.signedIn ? (
        <AccountDialog account={account} signOut={bridge.signOut} onChangeServer={openSetup} onClose={() => setAccountOpen(false)} />
      ) : null}
      {sprintWeb && setup && runtime.kind === 'ready' ? (
        <Onboarding
          entry={setup}
          cloud={runtime.sprint.cloud}
          account={runtime.sprint.account}
          counts={localCounts(runtime.sprint)}
          actions={onboardingActions}
          onClose={() => setSetup(null)}
        />
      ) : null}
      <ToastHost toasts={toasts} leaving={leaving} onDismiss={dismissToast} />
    </div>
  )
}
