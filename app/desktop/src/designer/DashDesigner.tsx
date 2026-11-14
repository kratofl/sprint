import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Redo2, Undo2 } from 'lucide-react'
import type { DashLayout } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { bridge, type DashCategoryLists, type SprintCommand, type SprintState } from '../bridge'
import { buildDashCreate, buildDashDelete, buildDashReset, buildDashSetCategory, buildDashSetScreenProfile, layoutScreenProfile, parseDashLayouts, screenChoices, type ScreenChoice } from '../views/DashesDomain'
import { deviceScreenSizes } from '../views/DevicesDomain'
import { openDashDesigner } from '../views/dashDesigner'
import { useDesignerDoc, type DesignerDocApi } from './useDesignerDoc'
import { AlertsSection } from './AlertsSection'
import { LayoutSection } from './LayoutSection'
import { SettingsSection } from './SettingsSection'
import { ThemeSection } from './ThemeSection'
import { isInOverlay, isTypingTarget } from './keys'
import { shownPage } from './layoutOps'
import '../views/DashesView.css'
import './DashDesigner.css'

type Section = 'layout' | 'alerts' | 'theme' | 'settings'

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'layout', label: 'Layout' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'theme', label: 'Theme' },
  { id: 'settings', label: 'Settings' },
]

/**
 * The dash designer window's page (`?designer=<dashId>`, electron/designerWindows.ts): one dash on
 * a stage, no app shell. It keeps its own state subscription, like the app shell does, and
 * renders nothing of the dash once the dash is gone (the window closes with it).
 */
export function DashDesigner({ dashId }: { dashId: string }) {
  const [sprint, setSprint] = useState<SprintState | null>(null)

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

  // Set right before Duplicate is sent; the effect below opens the copy, whose id it does not
  // know, once a state poll delivers it (dash.create answers with no id of its own).
  const pendingCopy = useRef<Set<string> | null>(null)
  const layouts = useMemo(() => (sprint ? parseDashLayouts(sprint.dashLayouts) : null), [sprint])

  useEffect(() => {
    const known = pendingCopy.current
    if (!known || !layouts) return
    const copy = layouts.find((layout) => !known.has(layout.id))
    if (copy) {
      pendingCopy.current = null
      openDashDesigner(copy.id)
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
    pendingCopy.current = new Set(layouts.map((layout) => layout.id))
    try {
      await send(buildDashCreate({ start: { kind: 'copy', dashId: host.id }, profileId: layoutScreenProfile(host).id }))
    } catch (error) {
      pendingCopy.current = null
      throw error
    }
  }

  return (
    <DesignerWindow
      host={host}
      frame={sprint.telemetry.frame}
      categories={sprint.dashCategories}
      screens={screenChoices(deviceScreenSizes(sprint.devices))}
      losses={sprint.dashRefitLosses[host.id] ?? {}}
      send={send}
      duplicate={duplicate}
    />
  )
}

function DesignerWindow({
  host,
  frame,
  categories,
  screens,
  losses,
  send,
  duplicate,
}: {
  host: DashLayout
  frame: TelemetryFrame | null
  categories: DashCategoryLists
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
  const page = shownPage(layout, chosenPageId)
  const idle = page !== null && page.id === layout.idlePage?.id
  const [actionError, setActionError] = useState<string | null>(null)
  const tabsId = useId()

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

  // Left/Right move between the section tabs (WAI-ARIA tabs pattern).
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
        {section === 'layout' && <LayoutSection doc={doc} frame={frame} chosenPageId={chosenPageId} onChoosePage={setChosenPageId} />}
        {section === 'alerts' && <AlertsSection layout={layout} apply={doc.apply} frame={frame} page={page} idle={idle} />}
        {section === 'theme' && <ThemeSection layout={layout} apply={doc.apply} frame={frame} page={page} idle={idle} />}
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
            onDelete={() => void send(buildDashDelete(layout.id)).catch((error: unknown) => setActionError(error instanceof Error ? error.message : 'The dash could not be deleted.'))}
          />
        )}
      </div>

      <NamePill doc={doc} />

      <div className="designer-glass designer-tabs" role="tablist" aria-label="Designer sections" onKeyDown={onTabKeyDown}>
        {SECTIONS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            id={`${tabsId}-${candidate.id}`}
            aria-selected={section === candidate.id}
            aria-controls={`${tabsId}-panel`}
            tabIndex={section === candidate.id ? 0 : -1}
            className="designer-tab"
            onClick={() => setSection(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <div className="designer-glass designer-tools">
        <button type="button" className="icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!doc.canUndo} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button type="button" className="icon-button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!doc.canRedo} onClick={redo}>
          <Redo2 size={16} />
        </button>
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

/** Top left: the dash's name and whether it is saved. A failed save offers to try again. */
function NamePill({ doc }: { doc: DesignerDocApi }) {
  return (
    <div className="designer-glass designer-pill">
      <span className="designer-pill-name">{doc.layout.name || 'Untitled dash'}</span>
      {doc.status === 'failed' ? (
        <button type="button" className="designer-pill-retry" title={doc.error ?? undefined} onClick={() => void doc.flush()}>
          Not saved · Retry
        </button>
      ) : (
        <span className="designer-pill-status" role="status">
          {doc.status === 'saving' ? 'Saving…' : 'Saved'}
        </span>
      )}
    </div>
  )
}
