import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Gauge, LayoutDashboard, Redo2, Settings2, Timer, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DashColoursContext, DashUnitsContext, resolvePreviewFrame, type DashLayout, type DashPreviewState } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { bridge, type DashCategoryLists, type DashMode, type SprintCommand, type SprintState } from '../bridge'
import { buildDashCreate, buildDashDelete, buildDashReset, buildDashSetCategory, buildDashSetScreenProfile, layoutScreenProfile, parseDashLayouts, screenChoices, type ScreenChoice } from '../views/DashesDomain'
import { deviceHasScreen, deviceScreenSizes, parseDashRules, parseDevices } from '../views/DevicesDomain'
import { openDashDesigner } from '../views/dashDesigner'
import { parseSettings } from '../views/SettingsDomain'
import { useDesignerDoc, type DesignerDocApi } from './useDesignerDoc'
import { LayoutSection } from './LayoutSection'
import { LapReviewEditor } from './LapReviewEditor'
import { PitLimiterSection } from './PitLimiterSection'
import { SettingsSection } from './SettingsSection'
import { isInOverlay, isTypingTarget } from './keys'
import { newModeId } from './pageModes'
import type { CanvasView } from './CanvasViews'
import { ViewTools } from './ViewTools'
import { ScopeStrip, UsedIn } from './ScopeStrip'
import { pointScope, type DashScope } from './dashScope'
import { changedScope, dropVariant, editAt, looksSame, shownLayout } from './variants'
import { BuildMark, currentBuild } from '../shell/BuildMark'
import type { RunningBuild } from '../shell/build'
import { platform } from '../platform'
import type { ModeActions } from './PageInspector'
import '../views/DashesView.css'
import './DashDesigner.css'

type Section = 'layout' | 'review' | 'pitLimiter' | 'settings'

type SectionTab = { id: Section; label: string; icon: LucideIcon }

/**
 * The rail's sections, as the main window's rail has areas: what the wheel shows (its pages, the
 * lap review, the pit limiter), then the dash's settings at the foot. There is no look to pick:
 * Sprint draws every dash the same way.
 */
const WHEEL_SECTIONS: readonly SectionTab[] = [
  { id: 'layout', label: 'Layout', icon: LayoutDashboard },
  { id: 'review', label: 'Lap review', icon: Timer },
  { id: 'pitLimiter', label: 'Pit limiter', icon: Gauge },
]
const SETTINGS_SECTION: SectionTab = { id: 'settings', label: 'Settings', icon: Settings2 }
const SECTIONS = [...WHEEL_SECTIONS, SETTINGS_SECTION]

/** A fresh window edits the dash itself: no device, game, class or car picked. */
const DASH_ITSELF: DashScope = { device: null, game: null, carClass: null, car: null }

/** The copy Duplicate waits for: the dash ids before it, and what to do with the copy's id. */
type PendingCopy = { known: ReadonlySet<string>; then: (copyId: string) => void }

/**
 * The dash designer window's page (`?designer=<dashId>`, electron/designerWindows.ts): one dash on
 * a stage, no app shell. It keeps its own state subscription, like the app shell does, and
 * renders nothing of the dash once the dash is gone (the window closes with it). The scope in the
 * title bar picks which version of the dash the sections edit (variants.ts).
 */
export function DashDesigner({ dashId }: { dashId: string }) {
  const [sprint, setSprint] = useState<SprintState | null>(null)
  const [scope, setScope] = useState<DashScope>(DASH_ITSELF)
  const [recorded, setRecorded] = useState<{ games: string[]; cars: string[] }>({ games: [], cars: [] })

  // The games and cars Sprint has recorded, for the strip's pickers (once; the Output tab loads them the same way).
  useEffect(() => {
    bridge
      .planContext()
      .then((context) => setRecorded({ games: [context.prefill.game, ...context.games], cars: [context.prefill.car, ...context.cars] }))
      .catch((error: unknown) => console.error('Loading recorded games and cars failed', error))
  }, [])

  useEffect(() => {
    bridge
      .getState()
      .then((state) => setSprint((current) => current ?? state))
      .catch((error: unknown) => console.error('Initial state load failed', error))
    return bridge.subscribe(setSprint)
  }, [])

  const send = useCallback((command: SprintCommand): Promise<void> => {
    const result = bridge.sendCommand(command)
    result.catch((error: unknown) => console.error('Command failed', command, error))
    return result
  }, [])

  // Set right before a copy is made; the effect below hands over the copy, whose id it does not
  // know, once a state poll delivers it (dash.create answers with no id of its own).
  const pendingCopy = useRef<PendingCopy | null>(null)
  const layouts = useMemo(() => (sprint ? parseDashLayouts(sprint.dashLayouts) : null), [sprint])
  const devices = useMemo(() => (sprint ? parseDevices(sprint.devices).filter((device) => device.purpose === 'dash' && deviceHasScreen(device)) : []), [sprint])
  const allDevices = useMemo(() => (sprint ? parseDashRules(sprint.settings.dashRules) : []), [sprint])

  useEffect(() => {
    const pending = pendingCopy.current
    if (!pending || !layouts) return
    const copy = layouts.find((layout) => !pending.known.has(layout.id))
    if (copy) {
      pendingCopy.current = null
      pending.then(copy.id)
    }
  }, [layouts])

  if (!sprint || !layouts) return <div className="designer" />
  const host = layouts.find((layout) => layout.id === dashId) ?? null
  if (!host) {
    return (
      <div className="designer ready">
        <div className="designer-dragband" />
        <div className="empty-state designer-gone">
          <h2>This dash is gone</h2>
          <p>It was deleted. Close this window.</p>
        </div>
      </div>
    )
  }

  const duplicate = async (): Promise<void> => {
    pendingCopy.current = { known: new Set(layouts.map((layout) => layout.id)), then: openDashDesigner }
    try {
      await send(buildDashCreate({ start: { kind: 'copy', dashId: host.id }, profileId: layoutScreenProfile(host).id }))
    } catch (error) {
      pendingCopy.current = null
      throw error
    }
  }

  const strip = {
    scope,
    layouts,
    devices,
    allDevices,
    games: recorded.games,
    cars: recorded.cars,
    onScope: setScope,
    /** The scope shows this dash on the wheel from now on (its device's or the rule's dash). */
    onPoint: async (): Promise<void> => {
      const command = pointScope(scope, dashId, devices, allDevices)
      if (command) await send(command)
    },
  }

  // The designer's dash pictures print in the driver's units and colours, as the wheel does.
  const settings = parseSettings(sprint.settings)
  return (
    <DashUnitsContext value={settings.units}>
      <DashColoursContext value={settings.colours}>
      <DesignerWindow
        key={host.id}
        host={host}
        strip={strip}
        frame={sprint.telemetry.frame}
        categories={sprint.dashCategories}
        modes={sprint.dashModes}
        screens={screenChoices(deviceScreenSizes(sprint.devices))}
        losses={sprint.dashRefitLosses[host.id] ?? {}}
        send={send}
        duplicate={duplicate}
        build={currentBuild(sprint)}
      />
      </DashColoursContext>
    </DashUnitsContext>
  )
}

type StripProps = Omit<Parameters<typeof ScopeStrip>[0], 'dash' | 'onPoint' | 'onDropVariant'> & {
  onPoint: () => Promise<void>
}

function DesignerWindow({
  host,
  strip,
  frame,
  categories,
  modes,
  screens,
  losses,
  send,
  duplicate,
  build,
}: {
  host: DashLayout
  /** The title bar's scope: what it picked and its actions. */
  strip: StripProps
  frame: TelemetryFrame | null
  categories: DashCategoryLists
  /** The driver's own dash modes (app-wide). */
  modes: DashMode[]
  screens: { fitting: ScreenChoice[]; other: ScreenChoice[] }
  /** Screen profile id → widgets a change to that size would leave out of the dash as saved. */
  losses: Readonly<Record<string, number>>
  send: (command: SprintCommand) => Promise<void>
  /** Copies the dash (as saved) and opens the copy in its own window once it exists. */
  duplicate: () => Promise<void>
  /** The running build, for the rail mark's colour. */
  build: RunningBuild | null
}) {
  const whole = useDesignerDoc(host, send)
  const { scope, onScope } = strip
  const shown = useMemo(() => shownLayout(whole.layout, scope), [whole.layout, scope])
  // Undo and redo run over the whole dash. One that changes a scope out of sight brings that scope up.
  const showChange = useRef(false)
  const lastLayout = useRef(whole.layout)
  useEffect(() => {
    const before = lastLayout.current
    lastLayout.current = whole.layout
    if (!showChange.current) return
    showChange.current = false
    const changed = changedScope(before, whole.layout)
    if (changed && looksSame(before, whole.layout, scope)) onScope(changed)
  }, [whole.layout, scope, onScope])
  const undo = useCallback(() => {
    if (!whole.canUndo) return
    showChange.current = true
    whole.undo()
  }, [whole])
  const redo = useCallback(() => {
    if (!whole.canRedo) return
    showChange.current = true
    whole.redo()
  }, [whole])
  // The sections see and edit the dash as the scope shows it; an edit goes into the scope's own variant.
  const doc: DesignerDocApi = {
    ...whole,
    layout: shown,
    apply: (mutate, group) => whole.apply((dash) => editAt(dash, scope, mutate), group),
    undo,
    redo,
  }
  const { layout } = doc
  const [section, setSection] = useState<Section>('layout')
  const [chosenPageId, setChosenPageId] = useState(() => host.pages[0]?.id ?? host.idlePage?.id ?? '')
  // How the Layout section shows the dash; kept here so it survives a trip to another section.
  const [view, setView] = useState<CanvasView>('outline')
  const [previewState, setPreviewState] = useState<DashPreviewState>('live')
  const [showGrid, setShowGrid] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const tabsId = useId()
  // The host owns the modes; the designer makes a new one's id up so a page can join it at once.
  const modeActions: ModeActions = {
    modes,
    create: async (name) => {
      const id = newModeId(name, modes)
      await send({ type: 'dash.mode.create', id, name })
      return id
    },
    rename: (id, name) => send({ type: 'dash.mode.rename', id, name }),
    remove: (id) => send({ type: 'dash.mode.delete', id }),
  }

  // The window title is the dash's name (Electron shows the page title).
  useEffect(() => {
    document.title = layout.name || 'Untitled dash'
  }, [layout.name])

  // Undo and redo over the whole dash: Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y (⌘ on macOS), never
  // while a text field has the keyboard (it keeps its own undo).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isTypingTarget(event.target) || isInOverlay(event.target)) return
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  /** Host commands that act on the dash wait for the last edit, so they act on what is shown. */
  const runAfterSave = async (action: () => Promise<void>, failure: string): Promise<void> => {
    setActionError(null)
    try {
      await doc.flush()
      await action()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : failure)
    }
  }

  // Up/Down move between the rail's section tabs (WAI-ARIA tabs pattern, vertical).
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const index = SECTIONS.findIndex((candidate) => candidate.id === section)
    const next = SECTIONS[(index + (event.key === 'ArrowDown' ? 1 : SECTIONS.length - 1)) % SECTIONS.length]
    setSection(next.id)
    document.getElementById(`${tabsId}-${next.id}`)?.focus()
  }

  const tab = ({ id, label, icon: Icon }: SectionTab) => (
    <button
      key={id}
      type="button"
      role="tab"
      id={`${tabsId}-${id}`}
      aria-selected={section === id}
      aria-controls={`${tabsId}-panel`}
      tabIndex={section === id ? 0 : -1}
      className={section === id ? 'rail-item active' : 'rail-item'}
      onClick={() => setSection(id)}
    >
      <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
      <span className="rail-item-label">{label}</span>
    </button>
  )

  return (
    <div className="designer ready">
      <nav className="rail" role="tablist" aria-label="Designer sections" aria-orientation="vertical" onKeyDown={onTabKeyDown}>
        <div className="rail-band">{platform === 'mac' ? null : <BuildMark build={build} />}</div>
        {WHEEL_SECTIONS.map(tab)}
        <div className="rail-spacer" />
        {tab(SETTINGS_SECTION)}
      </nav>

      <header className="designer-titlebar">
        <ScopeStrip
          {...strip}
          dash={whole.layout}
          onPoint={() => void runAfterSave(strip.onPoint, 'The dash could not be picked here.')}
          onDropVariant={() => whole.apply((dash) => dropVariant(dash, scope))}
        />
        <div className="designer-trail">
          {section === 'layout' && (
            <ViewTools view={view} onView={setView} previewState={previewState} onPreviewState={setPreviewState} showGrid={showGrid} onToggleGrid={() => setShowGrid((value) => !value)} />
          )}
          <div className="designer-tools" role="group" aria-label="History">
            <button type="button" className="icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!doc.canUndo} onClick={undo}>
              <Undo2 size={16} />
            </button>
            <button type="button" className="icon-button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!doc.canRedo} onClick={redo}>
              <Redo2 size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="designer-stage" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${section}`}>
        {section === 'layout' && (
          <LayoutSection
            doc={doc}
            frame={frame}
            chosenPageId={chosenPageId}
            onChoosePage={setChosenPageId}
            modes={modeActions}
            view={view}
            previewState={previewState}
            showGrid={showGrid}
          />
        )}
        {section === 'review' && (
          <LapReviewEditor layout={layout} apply={doc.apply} frame={resolvePreviewFrame(previewState, frame)} onOpenDashSettings={() => void bridge.openDashSettings()} />
        )}
        {section === 'pitLimiter' && <PitLimiterSection doc={doc} pageId={chosenPageId} modes={modeActions} onOpenDashSettings={() => void bridge.openDashSettings()} />}
        {section === 'settings' && (
          <SettingsSection
            layout={layout}
            apply={doc.apply}
            categories={categories}
            screens={screens}
            losses={losses}
            onCategory={(category) => void runAfterSave(() => send(buildDashSetCategory(layout.id, category)), 'The category could not be changed.')}
            onScreenProfile={(profileId) => void runAfterSave(() => send(buildDashSetScreenProfile(layout.id, profileId)), 'The screen size could not be changed.')}
            onDuplicate={() => void runAfterSave(duplicate, 'The dash could not be duplicated.')}
            onReset={() => void runAfterSave(() => send(buildDashReset(layout.id)), 'The dash could not be reset.')}
            onOpenDashSettings={() => void bridge.openDashSettings()}
            onDelete={() => void send(buildDashDelete(layout.id)).catch((error: unknown) => setActionError(error instanceof Error ? error.message : 'The dash could not be deleted.'))}
          />
        )}

        {actionError && (
          <div className="infobar error designer-notice" role="alert">
            <span className="infobar-icon" aria-hidden="true">
              !
            </span>
            <span className="infobar-message">{actionError}</span>
          </div>
        )}
      </div>

      <footer className="statusbar">
        <UsedIn dashId={host.id} devices={strip.devices} allDevices={strip.allDevices} />
        <VariantCount dash={whole.layout} />
        <span className="statusbar-spacer" />
        <SaveStatus doc={doc} />
      </footer>
    </div>
  )
}

/** How many versions the dash keeps for a device, game, class or car, beside where it is used. */
function VariantCount({ dash }: { dash: DashLayout }) {
  const count = dash.variants?.length ?? 0
  if (count === 0) return null
  return <span className="statusbar-item static">{count === 1 ? '1 version' : `${count} versions`}</span>
}

/** The status bar's end: whether the dash is saved. A failed save offers to try again. */
function SaveStatus({ doc }: { doc: DesignerDocApi }) {
  return doc.status === 'failed' ? (
    <button type="button" className="statusbar-item designer-save-retry" title={doc.error ?? undefined} onClick={() => void doc.flush()}>
      Not saved · Retry
    </button>
  ) : (
    <span className="statusbar-item static" role="status">
      {doc.status === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}
