import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { Copy, LayoutDashboard, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import '@sprint/dashboard/styles.css'
import { DashRenderer } from '@sprint/dashboard'
import type { DashLayout } from '@sprint/dashboard'
import type { SprintCommand } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { ConfirmDialog, ContentDialog } from '../shell/ContentDialog'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import { Status } from '../shell/Status'
import {
  SCREEN_PROFILES,
  buildDashCreate,
  buildDashDelete,
  buildDashDuplicate,
  buildDashSetDefault,
  fitScreenSize,
  layoutScreenProfile,
  parseDashLayouts,
  resolveScreenProfile,
  toTelemetryFrame,
} from './DashesDomain'
import { describeDeviceStatus, findScreen, parseDevices, parseScreens } from './DevicesDomain'
import type { ScreenStatusTone } from './DevicesDomain'
import { DashEditorPanel } from './DashEditorPanel'
import './DashesView.css'

// Library thumbnails fit every screen profile into the same box, so portrait and landscape
// dashes line up in the grid.
const THUMB_MAX_WIDTH = 220
const THUMB_MAX_HEIGHT = 132

type AssignedDevice = { id: string; name: string; status: string; tone: ScreenStatusTone }
type MenuState = { dashId: string; x: number; y: number }

/**
 * Dashes: the dash library (a Fluent GridView of live previews) and the hand-off to
 * `DashEditorPanel` for everything inside one dash. This view owns create, duplicate,
 * set-default and delete. Click or focus selects a dash, the CommandBar and the context
 * menu (right-click, Shift+F10) act on the selection, double-click or Enter opens the
 * editor, Delete asks to delete.
 */
export function DashesView({
  runtime = { kind: 'loading' },
  send = () => Promise.resolve(),
  focusDashId,
}: {
  runtime?: RuntimeState
  send?: (command: SprintCommand) => Promise<void>
  /** A dash to open on mount (Home's dash card), applied once — see the effect below. */
  focusDashId?: string
} = {}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // The card a context menu was raised from; focus returns there when the menu closes.
  const menuOrigin = useRef<HTMLElement | null>(null)

  const layouts = runtime.kind === 'ready' ? parseDashLayouts(runtime.sprint.dashLayouts) : null
  const frame = runtime.kind === 'ready' ? toTelemetryFrame(runtime.sprint.telemetry.frame) : null
  const devices = runtime.kind === 'ready' ? parseDevices(runtime.sprint.devices) : []
  const screens = runtime.kind === 'ready' ? parseScreens(runtime.sprint.screens) : []

  // `focusDashId` only ever names a live dash for one render (the shell clears it right
  // after handing it off — see App.tsx), so this only ever opens the editor once; the
  // guard also means a request for a dash that no longer exists is silently ignored.
  useEffect(() => {
    if (focusDashId && layouts?.some((layout) => layout.id === focusDashId)) {
      setSelectedId(focusDashId)
      setEditingId(focusDashId)
    }
  }, [focusDashId, layouts])

  if (layouts === null) {
    return (
      <div className="dashes-page">
        <PageHeader title="Dashes" />
        <div className="dashes-grid">
          <div className="card skeleton dashes-card dashes-card-skeleton" />
          <div className="card skeleton dashes-card dashes-card-skeleton" />
          <div className="card skeleton dashes-card dashes-card-skeleton" />
        </div>
      </div>
    )
  }

  const editing = layouts.find((layout) => layout.id === editingId) ?? null
  if (editing) {
    return <DashEditorPanel layout={editing} frame={frame} send={send} onClose={() => setEditingId(null)} />
  }

  // The selection always names a dash while the library has one: the last one picked, or the first.
  const selected = layouts.find((layout) => layout.id === selectedId) ?? layouts[0] ?? null
  const duplicating = layouts.find((layout) => layout.id === duplicatingId) ?? null
  const confirmingDelete = layouts.find((layout) => layout.id === confirmDeleteId) ?? null
  const menuLayout = menu ? layouts.find((layout) => layout.id === menu.dashId) ?? null : null

  /** Why a dash cannot be deleted, or null when it can. */
  const deleteBlockedReason = (layout: DashLayout): string | null =>
    layout.default ? 'The default dash cannot be deleted.' : layouts.length <= 1 ? 'The only dash cannot be deleted.' : null

  const assignedDevices = (layoutId: string): AssignedDevice[] =>
    devices
      .filter((device) => device.dashId === layoutId)
      .map((device) => {
        const status = describeDeviceStatus(device, findScreen(screens, device.id))
        return { id: device.id, name: device.name, status: status.label, tone: status.tone }
      })

  const runAction = async (command: SprintCommand) => {
    setActionError(null)
    try {
      await send(command)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The dash could not be updated.')
    }
  }

  const askDelete = (layout: DashLayout): void => {
    if (deleteBlockedReason(layout) === null) setConfirmDeleteId(layout.id)
  }

  const openMenu = (layout: DashLayout, event: ReactMouseEvent<HTMLElement>): void => {
    event.preventDefault()
    setSelectedId(layout.id)
    menuOrigin.current = event.currentTarget
    // A keyboard-raised context menu (Shift+F10, the Menu key) reports no pointer position;
    // anchor it to the card instead.
    const anchor = event.currentTarget.getBoundingClientRect()
    const x = event.clientX > 0 || event.clientY > 0 ? event.clientX : anchor.left + 16
    const y = event.clientX > 0 || event.clientY > 0 ? event.clientY : anchor.top + 16
    setMenu({ dashId: layout.id, x: Math.min(x, window.innerWidth - 228), y: Math.min(y, window.innerHeight - 160) })
  }

  const selectedDeleteBlocked = selected ? deleteBlockedReason(selected) : 'Select a dash first.'

  return (
    <div className="dashes-page">
      <PageHeader title="Dashes">
        <button type="button" className="button primary" onClick={() => setShowCreate(true)}>
          <Plus /> New dash
        </button>
        <CommandDivider />
        <button type="button" className="button subtle" disabled={!selected} onClick={() => selected && setEditingId(selected.id)}>
          <Pencil /> Edit
        </button>
        <button type="button" className="button subtle" disabled={!selected} onClick={() => selected && setDuplicatingId(selected.id)}>
          <Copy /> Duplicate
        </button>
        <button
          type="button"
          className="button subtle"
          disabled={!selected || selected.default}
          title={selected?.default ? 'This is already the default dash.' : undefined}
          onClick={() => selected && void runAction(buildDashSetDefault(selected.id))}
        >
          <Star /> Set as default
        </button>
        <CommandDivider />
        <button
          type="button"
          className="button subtle destructive"
          disabled={selectedDeleteBlocked !== null}
          title={selectedDeleteBlocked ?? undefined}
          onClick={() => selected && askDelete(selected)}
        >
          <Trash2 /> Delete
        </button>
      </PageHeader>

      {actionError && (
        <div className="infobar error" role="alert">
          <span className="infobar-icon">!</span>
          <strong className="infobar-title">Dash not updated</strong>
          <span className="infobar-message">{actionError}</span>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setActionError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {layouts.length === 0 ? (
        <div className="empty-state">
          <LayoutDashboard size={28} strokeWidth={1.5} />
          <h2>No dashes yet</h2>
          <p>Create a dash to design a wheel-screen layout and assign it to a device.</p>
        </div>
      ) : (
        <div className="dashes-grid" role="listbox" aria-label="Dashes" aria-orientation="horizontal">
          {layouts.map((layout) => (
            <DashCard
              key={layout.id}
              layout={layout}
              frame={frame}
              devices={assignedDevices(layout.id)}
              selected={selected?.id === layout.id}
              onSelect={() => setSelectedId(layout.id)}
              onOpen={() => setEditingId(layout.id)}
              onDelete={() => askDelete(layout)}
              onContextMenu={(event) => openMenu(layout, event)}
            />
          ))}
        </div>
      )}

      {menu && menuLayout && (
        <DashMenu
          x={menu.x}
          y={menu.y}
          layout={menuLayout}
          deleteBlockedReason={deleteBlockedReason(menuLayout)}
          onClose={() => {
            setMenu(null)
            menuOrigin.current?.focus()
          }}
          onEdit={() => setEditingId(menuLayout.id)}
          onDuplicate={() => setDuplicatingId(menuLayout.id)}
          onSetDefault={() => void runAction(buildDashSetDefault(menuLayout.id))}
          onDelete={() => askDelete(menuLayout)}
        />
      )}

      {showCreate && (
        <ScreenSizeDialog
          title="New dash"
          message="Choose the wheel-screen size this dash is designed for. You can change it later."
          confirmLabel="Create"
          defaultProfileId={SCREEN_PROFILES[0].id}
          onCancel={() => setShowCreate(false)}
          onConfirm={(profileId) => {
            setShowCreate(false)
            void runAction(buildDashCreate(profileId))
          }}
        />
      )}

      {duplicating && (
        <ScreenSizeDialog
          title="Duplicate dash"
          message={`Creates a copy of ${duplicating.name}, refitted to the screen size you choose.`}
          confirmLabel="Duplicate"
          defaultProfileId={layoutScreenProfile(duplicating).id}
          onCancel={() => setDuplicatingId(null)}
          onConfirm={(profileId) => {
            setDuplicatingId(null)
            void runAction(buildDashDuplicate(duplicating.id, profileId))
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete ${confirmingDelete.name}?`}
          message="The dash and all of its pages are removed. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            setConfirmDeleteId(null)
            void runAction(buildDashDelete(confirmingDelete.id))
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

/** One GridView item: a live thumbnail, the name, the screen size, and the devices showing it. */
function DashCard({
  layout,
  frame,
  devices,
  selected,
  onSelect,
  onOpen,
  onDelete,
  onContextMenu,
}: {
  layout: DashLayout
  frame: ReturnType<typeof toTelemetryFrame>
  devices: AssignedDevice[]
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onDelete: () => void
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
}) {
  const profile = layoutScreenProfile(layout)
  const thumb = fitScreenSize(profile, THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT)
  const pageCount = layout.pages.length + (layout.idlePage ? 1 : 0)

  // Selection follows focus (Fluent GridView); arrow keys move between cards.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onOpen()
    } else if (event.key === 'Delete') {
      event.preventDefault()
      onDelete()
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      const sibling = forward ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling
      if (sibling instanceof HTMLElement) sibling.focus()
    }
  }

  return (
    <div
      className={selected ? 'card dashes-card selected' : 'card dashes-card'}
      role="option"
      aria-selected={selected}
      aria-label={layout.name}
      tabIndex={0}
      onFocus={onSelect}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
    >
      <div className="dashes-thumb">
        <DashRenderer layout={layout} frame={frame} width={thumb.width} height={thumb.height} className="dashes-thumb-canvas" />
      </div>

      <div className="dashes-card-body">
        <div className="dashes-card-title-row">
          <span className="dashes-card-name">{layout.name}</span>
          {layout.default && (
            <span className="chip chip-default">
              <Star size={11} /> Default
            </span>
          )}
        </div>
        <span className="muted">
          {profile.name} · {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </span>

        <div className="dashes-devices">
          {devices.length === 0 ? (
            <span className="muted">Not assigned to a device</span>
          ) : (
            devices.map((device) => (
              <div key={device.id} className="dashes-device">
                <span className="dashes-device-name">{device.name}</span>
                <Status tone={device.tone} quiet>
                  {device.status}
                </Status>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/** Context menu for one dash (MenuFlyout): the CommandBar's actions, Delete last. */
function DashMenu({
  x,
  y,
  layout,
  deleteBlockedReason,
  onClose,
  onEdit,
  onDuplicate,
  onSetDefault,
  onDelete,
}: {
  x: number
  y: number
  layout: DashLayout
  deleteBlockedReason: string | null
  onClose: () => void
  onEdit: () => void
  onDuplicate: () => void
  onSetDefault: () => void
  onDelete: () => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.focus()
  }, [])

  const run = (action: () => void) => () => {
    onClose()
    action()
  }

  // Up/Down move between enabled items; Escape and Tab close the menu.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') ?? [])]
    const index = items.findIndex((item) => item === document.activeElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div
      className="dashes-menu-layer"
      onPointerDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        ref={menuRef}
        className="menu-flyout dashes-menu"
        role="menu"
        aria-label={`${layout.name} actions`}
        style={{ left: x, top: y }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <button type="button" role="menuitem" className="menu-item" onClick={run(onEdit)}>
          <Pencil />
          <span className="menu-item-label">Edit</span>
          <span className="menu-item-shortcut">Enter</span>
        </button>
        <button type="button" role="menuitem" className="menu-item" onClick={run(onDuplicate)}>
          <Copy />
          <span className="menu-item-label">Duplicate</span>
        </button>
        <button type="button" role="menuitem" className="menu-item" disabled={layout.default} onClick={run(onSetDefault)}>
          <Star />
          <span className="menu-item-label">Set as default</span>
        </button>
        <div className="menu-separator" role="separator" />
        <button
          type="button"
          role="menuitem"
          className="menu-item destructive"
          disabled={deleteBlockedReason !== null}
          title={deleteBlockedReason ?? undefined}
          onClick={run(onDelete)}
        >
          <Trash2 />
          <span className="menu-item-label">Delete</span>
          <span className="menu-item-shortcut">Del</span>
        </button>
      </div>
    </div>
  )
}

/** ContentDialog that picks a screen size: shared by "New dash" and "Duplicate dash". */
function ScreenSizeDialog({
  title,
  message,
  confirmLabel,
  defaultProfileId,
  onCancel,
  onConfirm,
}: {
  title: string
  message: string
  confirmLabel: string
  defaultProfileId: string
  onCancel: () => void
  onConfirm: (profileId: string) => void
}) {
  const [profileId, setProfileId] = useState(defaultProfileId)
  const profile = resolveScreenProfile(profileId)

  return (
    <ContentDialog
      title={title}
      onCancel={onCancel}
      footer={
        <>
          <button type="button" className="button primary" onClick={() => onConfirm(profileId)}>
            {confirmLabel}
          </button>
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        </>
      }
    >
      <p className="content-dialog-text">{message}</p>
      <label className="field">
        <span>Screen size</span>
        <select value={profileId} autoFocus onChange={(event) => setProfileId(event.target.value)}>
          {SCREEN_PROFILES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <span className="field-hint">
          {profile.gridCols} × {profile.gridRows} layout grid
        </span>
      </label>
    </ContentDialog>
  )
}
