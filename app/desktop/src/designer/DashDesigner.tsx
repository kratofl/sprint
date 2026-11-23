import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Gauge, LayoutDashboard, Redo2, Settings2, Timer, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DashColoursContext, DashUnitsContext, resolvePreviewFrame, type DashLayout, type DashPreviewState } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { bridge, type DashCategoryLists, type DashMode, type SprintCommand, type SprintState } from '../bridge'
import { buildDashCreate, buildDashDelete, buildDashReset, buildDashSetCategory, buildDashSetScreenProfile, layoutScreenProfile, parseDashLayouts, screenChoices, type ScreenChoice } from '../views/DashesDomain'
import { deviceHasScreen, deviceScreenSizes, parseDashRules, parseDevices, type Device, type DeviceDashRule } from '../views/DevicesDomain'
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
import { ScopeStrip } from './ScopeStrip'
import { placesOf, pointScope, scopeName, scopeOf, shownDash, type DashScope } from './dashScope'
import type { ModeActions } from './PageInspector'
import '../views/DashesView.css'
import './DashDesigner.css'

type Section = 'layout' | 'review' | 'pitLimiter' | 'settings'

/**
 * The toolbar's sections in two tab groups: what the wheel shows (its pages, the lap review, the
 * pit limiter), then the dash's settings. There is no look to pick: Sprint draws every dash the
 * same way. Icon and text, as Luca asked (docs/design/DESIGN.md has the exception).
 */
const SECTION_GROUPS: ReadonlyArray<ReadonlyArray<{ id: Section; label: string; icon: LucideIcon }>> = [
  [
    { id: 'layout', label: 'Layout', icon: LayoutDashboard },
    { id: 'review', label: 'Lap review', icon: Timer },
    { id: 'pitLimiter', label: 'Pit limiter', icon: Gauge },
  ],
  [{ id: 'settings', label: 'Settings', icon: Settings2 }],
]
const SECTIONS = SECTION_GROUPS.flat()

/** Where a fresh window looks: the first place its dash is used, else the first screen's own dash. */
function firstScope(dashId: string, devices: readonly Device[], allDevices: readonly DeviceDashRule[]): DashScope {
  const place = placesOf(dashId, devices, allDevices)[0]
  if (place) return scopeOf(place)
  return devices[0] ? { device: devices[0].id, game: null, carClass: null, car: null } : { device: null, game: 'LeMansUltimate', carClass: null, car: null }
}

/** The copy Duplicate or "Own copy" waits for: the dash ids before it, and what to do with the copy's id. */
type PendingCopy = { known: ReadonlySet<string>; then: (copyId: string) => void }

/**
 * The dash designer window's page (`?designer=<dashId>`, electron/designerWindows.ts): one dash on
 * a stage, no app shell. It keeps its own state subscription, like the app shell does, and
 * renders nothing of the dash once the dash is gone (the window closes with it). The scope strip
 * moves the window on to another dash (`bridge.switchDashDesigner`); the scope survives that.
 */
export function DashDesigner({ dashId: openedDashId }: { dashId: string }) {
  const [sprint, setSprint] = useState<SprintState | null>(null)
  const [dashId, setDashId] = useState(openedDashId)
  const [scope, setScope] = useState<DashScope | null>(null)
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
  const shownScope = scope ?? firstScope(dashId, devices, allDevices)
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

  const copyThen = async (name: string | undefined, then: (copyId: string) => void): Promise<void> => {
    pendingCopy.current = { known: new Set(layouts.map((layout) => layout.id)), then }
    try {
      await send(buildDashCreate({ start: { kind: 'copy', dashId: host.id }, profileId: layoutScreenProfile(host).id, name }))
    } catch (error) {
      pendingCopy.current = null
      throw error
    }
  }
  const duplicate = (): Promise<void> => copyThen(undefined, openDashDesigner)

  // The window moves on to another dash, or that dash's own window comes forward.
  const open = async (id: string): Promise<void> => {
    if (id === dashId) return
    if ((await bridge.switchDashDesigner(id)) === 'switched') setDashId(id)
  }
  const exists = (id: string): boolean => layouts.some((layout) => layout.id === id)
  const strip = {
    scope: shownScope,
    layouts,
    devices,
    allDevices,
    games: recorded.games,
    cars: recorded.cars,
    /** A scope opens the dash it shows. */
    onScope: (next: DashScope): Promise<void> => {
      setScope(next)
      const target = shownDash(next, devices, allDevices, exists)
      return target ? open(target.dashId) : Promise.resolve()
    },
    /** The scope points at `id` from now on, and the window opens it. */
    onPoint: async (id: string): Promise<void> => {
      const command = pointScope(shownScope, id, devices, allDevices)
      if (!command) return
      await send(command)
      await open(id)
    },
    /** The scope gets a copy of this dash of its own, and the window opens the copy. */
    onOwnCopy: (): Promise<void> =>
      copyThen(`${host.name} · ${scopeName(shownScope, devices)}`, (copyId) => {
        const command = pointScope(shownScope, copyId, devices, allDevices)
        if (command) void send(command).then(() => open(copyId))
      }),
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
      />
      </DashColoursContext>
    </DashUnitsContext>
  )
}

type StripProps = Omit<Parameters<typeof ScopeStrip>[0], 'dashId' | 'status' | 'onScope' | 'onPoint' | 'onOwnCopy'> & {
  onScope: (scope: DashScope) => Promise<void>
  onPoint: (dashId: string) => Promise<void>
  onOwnCopy: () => Promise<void>
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
}: {
  host: DashLayout
  /** The scope strip's state and actions; every action saves the last edit first. */
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
}) {
  const doc = useDesignerDoc(host, send)
  const { layout, undo, redo } = doc
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

  // Left/Right move between the section tabs, across both groups (WAI-ARIA tabs pattern).
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = SECTIONS.findIndex((candidate) => candidate.id === section)
    const next = SECTIONS[(index + (event.key === 'ArrowRight' ? 1 : SECTIONS.length - 1)) % SECTIONS.length]
    setSection(next.id)
    document.getElementById(`${tabsId}-${next.id}`)?.focus()
  }

  return (
    <div className="designer ready">
      <div className="designer-dragband" />

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
      </div>

      <ScopeStrip
        {...strip}
        dashId={host.id}
        onScope={(scope) => void runAfterSave(() => strip.onScope(scope), 'The dash could not be opened.')}
        onPoint={(id) => void runAfterSave(() => strip.onPoint(id), 'The dash could not be picked here.')}
        onOwnCopy={() => void runAfterSave(strip.onOwnCopy, 'The copy could not be made.')}
        status={<SaveStatus doc={doc} />}
      />

      <div className="designer-toolbar">
        <span aria-hidden="true" />

        <div className="designer-tab-groups" role="tablist" aria-label="Designer sections" onKeyDown={onTabKeyDown}>
          {SECTION_GROUPS.map((group) => (
            <div key={group[0]?.id} className="designer-glass designer-tabs" role="presentation">
              {group.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`${tabsId}-${id}`}
                  aria-selected={section === id}
                  aria-controls={`${tabsId}-panel`}
                  tabIndex={section === id ? 0 : -1}
                  className="designer-tab"
                  onClick={() => setSection(id)}
                >
                  <Icon size={15} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="designer-trail">
          {section === 'layout' && (
            <ViewTools view={view} onView={setView} previewState={previewState} onPreviewState={setPreviewState} showGrid={showGrid} onToggleGrid={() => setShowGrid((value) => !value)} />
          )}
          <div className="designer-glass designer-tools">
            <button type="button" className="icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!doc.canUndo} onClick={undo}>
              <Undo2 size={16} />
            </button>
            <button type="button" className="icon-button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!doc.canRedo} onClick={redo}>
              <Redo2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="infobar error designer-notice" role="alert">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <span className="infobar-message">{actionError}</span>
        </div>
      )}

    </div>
  )
}

/** The end of the scope strip: whether the dash is saved. A failed save offers to try again. */
function SaveStatus({ doc }: { doc: DesignerDocApi }) {
  return doc.status === 'failed' ? (
    <button type="button" className="designer-pill-retry" title={doc.error ?? undefined} onClick={() => void doc.flush()}>
      Not saved · Retry
    </button>
  ) : (
    <span className="designer-pill-status" role="status">
      {doc.status === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}
