import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { ChevronRight, LayoutDashboard, LayoutGrid, List, MoreHorizontal, Plus, X } from 'lucide-react'
import type { DashLayout } from '@sprint/dashboard'
import type { DashCategoryLists, DashRefitLosses, SprintCommand, SprintState } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { ConfirmDialog } from '../shell/ContentDialog'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import {
  ALL_DASHES,
  buildDashCategoryCreate,
  buildDashCategoryDelete,
  buildDashCategoryRename,
  buildDashCreate,
  buildDashDelete,
  buildDashSetCategory,
  buildDashesViewMode,
  dashPageCount,
  dashSummary,
  dashesFilterOptions,
  formatPageCount,
  groupDashes,
  knownDashCategory,
  layoutScreenProfile,
  newDashCategory,
  parseDashLayouts,
  parseDashesViewMode,
  resolveDashesFilter,
  sameDashesFilter,
  screenChoices,
  visibleDashGroups,
} from './DashesDomain'
import type { DashGroup, DashesFilter, DashesViewMode } from './DashesDomain'
import { deviceScreenSizes } from './DevicesDomain'
import { CategoryMenu, DashMenu } from './DashesMenus'
import type { MenuAnchor } from './DashesMenus'
import { CategoryNameDialog, DuplicateDashDialog, NewDashDialog } from './DashesDialogs'
import type { NewDash } from './DashesDialogs'
import { DashStill } from './DashStill'
import { openDashDesigner } from './dashDesigner'
import './DevicesView.css'
import './DashesView.css'

type LoadedState = {
  layouts: DashLayout[]
  categories: DashCategoryLists
  /** The user's screens at their logical (rotated) size, for the New dash and Duplicate dialogs' "Fits …". */
  screens: Array<{ name: string; width: number; height: number }>
  /** Per dash, what each screen size would leave out of a copy (the Duplicate dialog's warning). */
  refitLosses: DashRefitLosses
  viewMode: DashesViewMode
}

const toLoadedState = (sprint: SprintState): LoadedState => ({
  layouts: parseDashLayouts(sprint.dashLayouts),
  categories: sprint.dashCategories,
  screens: deviceScreenSizes(sprint.devices),
  refitLosses: sprint.dashRefitLosses,
  viewMode: parseDashesViewMode(sprint.settings),
})

/** The one dialog open over the overview, if any. */
type Dialog =
  | { kind: 'newDash' }
  | { kind: 'duplicateDash'; dashId: string }
  | { kind: 'newCategory'; dashId: string }
  | { kind: 'renameCategory'; name: string }
  | { kind: 'deleteCategory'; name: string }
  | { kind: 'deleteDash'; dashId: string }

type OpenMenu = { kind: 'dash'; dashId: string; anchor: MenuAnchor } | { kind: 'category'; name: string; anchor: MenuAnchor }

// The picture box of a tile, and of a list row's thumbnail; every screen shape fits inside.
const TILE_STILL = { width: 264, height: 142 }
const ROW_STILL = { width: 60, height: 36 }

/**
 * Dashes: every dash as a still picture, in tiles or a list, grouped by category and filtered
 * by one. Nothing here says which device shows a dash — that lives on the Devices page. A click
 * or Enter opens the dash in the designer (`openDashDesigner`); its ⋯, a right-click or Shift+F10
 * opens its menu, and Delete asks to delete it. This view owns creating, duplicating, filing and
 * deleting dashes, and the user's own categories.
 */
export function DashesView({
  runtime = { kind: 'loading' },
  send = () => Promise.resolve(),
  focusDashId,
  openNewDash = false,
}: {
  runtime?: RuntimeState
  send?: (command: SprintCommand) => Promise<void>
  /** A dash to open on mount (Home's dash card), applied once — see the effect below. */
  focusDashId?: string
  /** Opens the New dash dialog on mount (the command palette's "Create dash"), applied once like `focusDashId`. */
  openNewDash?: boolean
} = {}) {
  const [chosenFilter, setChosenFilter] = useState<DashesFilter>(ALL_DASHES)
  // The saved layout arrives with the next state poll; this shows a click at once meanwhile.
  const [pendingViewMode, setPendingViewMode] = useState<DashesViewMode | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [menu, setMenu] = useState<OpenMenu | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // What raised the open menu; focus returns there when it closes.
  const menuOrigin = useRef<HTMLElement | null>(null)
  // Set right before a create is sent; the effect below opens the dash whose id it does not
  // know once the poll delivers it (dash.create answers with no id of its own).
  const pendingCreateIds = useRef<Set<string> | null>(null)

  const state = runtime.kind === 'ready' ? toLoadedState(runtime.sprint) : null
  const layouts = state?.layouts ?? null

  // `focusDashId` only ever names a live dash for one render (the shell clears it right
  // after handing it off — see App.tsx), so this opens the dash once; a request for a dash
  // that no longer exists is ignored.
  useEffect(() => {
    if (focusDashId && layouts?.some((layout) => layout.id === focusDashId)) openDashDesigner(focusDashId)
  }, [focusDashId, layouts])

  useEffect(() => {
    if (openNewDash) setDialog({ kind: 'newDash' })
  }, [openNewDash])

  useEffect(() => {
    const known = pendingCreateIds.current
    if (!known || layouts === null) return
    const created = layouts.find((layout) => !known.has(layout.id))
    if (created) {
      pendingCreateIds.current = null
      openDashDesigner(created.id)
    }
  }, [layouts])

  if (state === null || layouts === null) {
    return (
      <div className="devices dashes">
        <PageHeader title="Dashes" />
        <div className="devices-grid">
          <div className="card skeleton dashes-tile-skeleton" />
          <div className="card skeleton dashes-tile-skeleton" />
          <div className="card skeleton dashes-tile-skeleton" />
        </div>
      </div>
    )
  }

  const { categories } = state
  const groups = groupDashes(layouts, categories)
  const filter = resolveDashesFilter(chosenFilter, categories)
  const filterOptions = dashesFilterOptions(groups, filter)
  const visible = visibleDashGroups(groups, filter)
  // Headings name the groups under All; a custom category keeps its heading (and its ⋯) even alone.
  const showHeading = (group: DashGroup): boolean => group.custom || (filter.kind === 'all' && groups.length > 1)
  const viewMode = pendingViewMode ?? state.viewMode
  const find = (dashId: string): DashLayout | null => layouts.find((layout) => layout.id === dashId) ?? null

  const runAction = async (command: SprintCommand): Promise<void> => {
    setActionError(null)
    try {
      await send(command)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The dash could not be updated.')
    }
  }

  const chooseViewMode = (mode: DashesViewMode): void => {
    setPendingViewMode(mode)
    void send(buildDashesViewMode(mode)).catch(() => setPendingViewMode(null))
  }

  const createDash = async (dash: NewDash): Promise<void> => {
    setDialog(null)
    setActionError(null)
    pendingCreateIds.current = new Set(layouts.map((layout) => layout.id))
    try {
      await send(buildDashCreate(dash))
    } catch (error) {
      pendingCreateIds.current = null
      setActionError(error instanceof Error ? error.message : 'The dash could not be created.')
    }
  }

  const closeMenu = (): void => {
    setMenu(null)
    menuOrigin.current?.focus()
  }

  // A pointer opens the menu where it is; a keyboard (Shift+F10, the Menu key) or the ⋯ under the control.
  const openMenuAt = (event: ReactMouseEvent<HTMLElement>, below: boolean): MenuAnchor => {
    // A tile's menu returns focus to the tile's own button, not its (unfocusable) card.
    menuOrigin.current = event.currentTarget.querySelector<HTMLElement>('.dashes-tile-open') ?? event.currentTarget
    const box = event.currentTarget.getBoundingClientRect()
    if (below) return { x: box.left, y: box.bottom + 4 }
    return event.clientX > 0 || event.clientY > 0 ? { x: event.clientX, y: event.clientY } : { x: box.left + 16, y: box.top + 16 }
  }

  const dashActions = (layout: DashLayout) => ({
    onOpen: () => openDashDesigner(layout.id),
    onDelete: () => setDialog({ kind: 'deleteDash', dashId: layout.id }),
    onMenu: (event: ReactMouseEvent<HTMLElement>, below: boolean) => {
      event.preventDefault()
      event.stopPropagation()
      setMenu({ kind: 'dash', dashId: layout.id, anchor: openMenuAt(event, below) })
    },
  })

  const menuDash = menu?.kind === 'dash' ? find(menu.dashId) : null
  const deletingDash = dialog?.kind === 'deleteDash' ? find(dialog.dashId) : null
  const filingDash = dialog?.kind === 'newCategory' ? find(dialog.dashId) : null
  const copyingDash = dialog?.kind === 'duplicateDash' ? find(dialog.dashId) : null

  return (
    <div className="devices dashes">
      <PageHeader title="Dashes">
        <button type="button" className="button primary" onClick={() => setDialog({ kind: 'newDash' })}>
          <Plus /> New dash
        </button>
        {layouts.length > 0 && (
          <>
            <CommandDivider />
            <div className="segmented devices-layout" role="radiogroup" aria-label="Layout">
              <button type="button" role="radio" className="segmented-item" aria-checked={viewMode === 'gallery'} aria-label="Tiles" title="Tiles" onClick={() => chooseViewMode('gallery')}>
                <LayoutGrid size={14} />
              </button>
              <button type="button" role="radio" className="segmented-item" aria-checked={viewMode === 'list'} aria-label="List" title="List" onClick={() => chooseViewMode('list')}>
                <List size={14} />
              </button>
            </div>
          </>
        )}
      </PageHeader>

      {actionError && (
        <div className="infobar error dashes-infobar" role="alert">
          <span className="infobar-icon">!</span>
          <strong className="infobar-title">Dash not updated</strong>
          <span className="infobar-message">{actionError}</span>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setActionError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {layouts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <LayoutDashboard size={28} strokeWidth={1.5} />
            <h2>No dashes yet</h2>
            <p>Create a dash to design what your wheel screen shows.</p>
          </div>
        </div>
      ) : (
        <>
          {filterOptions && (
            <div className="segmented devices-filter" role="radiogroup" aria-label="Show">
              {filterOptions.map((option) => (
                <button
                  key={option.filter.kind === 'category' ? `category:${option.filter.name}` : option.filter.kind}
                  type="button"
                  role="radio"
                  className="segmented-item"
                  aria-checked={sameDashesFilter(option.filter, filter)}
                  onClick={() => setChosenFilter(option.filter)}
                >
                  {option.label} <span className="devices-filter-count tabular">{option.count}</span>
                </button>
              ))}
            </div>
          )}
          {visible.length === 0 && <p className="muted devices-none">No dashes in this category.</p>}
          {visible.map((group) => (
            <section key={group.title} className="devices-group" aria-label={group.title}>
              {showHeading(group) && (
                <div className="dashes-group-head">
                  <h2 className="devices-group-title">
                    {group.title} <span className="muted tabular">{group.dashes.length}</span>
                    {group.custom && <span className="dashes-group-tag">Your category</span>}
                  </h2>
                  {group.custom && (
                    <button
                      type="button"
                      className="icon-button dashes-group-more"
                      aria-label={`${group.title} actions`}
                      title="Rename or delete"
                      onClick={(event) => setMenu({ kind: 'category', name: group.title, anchor: openMenuAt(event, true) })}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  )}
                </div>
              )}
              {viewMode === 'gallery' ? (
                <div className="devices-grid">
                  {group.dashes.map((layout) => (
                    <DashTile key={layout.id} layout={layout} {...dashActions(layout)} />
                  ))}
                </div>
              ) : (
                <div className="card list-card">
                  <div className="list-header dashes-columns" aria-hidden="true">
                    <span />
                    <span>Dash</span>
                    <span>Screen</span>
                    <span>Pages</span>
                    <span />
                  </div>
                  <ul className="list-rows">
                    {group.dashes.map((layout) => (
                      <DashRow key={layout.id} layout={layout} {...dashActions(layout)} />
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </>
      )}

      {menu?.kind === 'dash' && menuDash && (
        <DashMenu
          anchor={menu.anchor}
          dashName={menuDash.name}
          category={knownDashCategory(menuDash, categories)}
          categories={categories}
          onClose={closeMenu}
          onEdit={() => openDashDesigner(menuDash.id)}
          onDuplicate={() => setDialog({ kind: 'duplicateDash', dashId: menuDash.id })}
          onSetCategory={(category) => void runAction(buildDashSetCategory(menuDash.id, category))}
          onNewCategory={() => setDialog({ kind: 'newCategory', dashId: menuDash.id })}
          onDelete={() => setDialog({ kind: 'deleteDash', dashId: menuDash.id })}
        />
      )}

      {menu?.kind === 'category' && (
        <CategoryMenu
          anchor={menu.anchor}
          name={menu.name}
          onClose={closeMenu}
          onRename={() => setDialog({ kind: 'renameCategory', name: menu.name })}
          onDelete={() => setDialog({ kind: 'deleteCategory', name: menu.name })}
        />
      )}

      {dialog?.kind === 'newDash' && (
        <NewDashDialog
          categories={categories}
          screens={screenChoices(state.screens)}
          initialCategory={newDashCategory(filter)}
          onCancel={() => setDialog(null)}
          onCreate={(dash) => void createDash(dash)}
        />
      )}

      {copyingDash && (
        <DuplicateDashDialog
          source={copyingDash}
          losses={state.refitLosses[copyingDash.id] ?? {}}
          categories={categories}
          screens={screenChoices(state.screens)}
          onCancel={() => setDialog(null)}
          onCreate={(dash) => void createDash(dash)}
        />
      )}

      {filingDash && (
        <CategoryNameDialog
          title="New category"
          message={`${filingDash.name} moves into it.`}
          confirmLabel="Create"
          categories={categories}
          onCancel={() => setDialog(null)}
          onConfirm={(name) => {
            setDialog(null)
            void runAction(buildDashCategoryCreate(name, filingDash.id))
          }}
        />
      )}

      {dialog?.kind === 'renameCategory' && (
        <CategoryNameDialog
          title="Rename category"
          confirmLabel="Rename"
          initialName={dialog.name}
          renaming={dialog.name}
          categories={categories}
          onCancel={() => setDialog(null)}
          onConfirm={(newName) => {
            setDialog(null)
            // Keep looking at the category under its new name.
            if (filter.kind === 'category' && filter.name === dialog.name) setChosenFilter({ kind: 'category', name: newName })
            void runAction(buildDashCategoryRename(dialog.name, newName))
          }}
        />
      )}

      {dialog?.kind === 'deleteCategory' && (
        <ConfirmDialog
          title={`Delete ${dialog.name}?`}
          message={deleteCategoryMessage(groups.find((group) => group.custom && group.title === dialog.name)?.dashes.length ?? 0)}
          confirmLabel="Delete"
          destructive
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null)
            void runAction(buildDashCategoryDelete(dialog.name))
          }}
        />
      )}

      {deletingDash && (
        <ConfirmDialog
          title={`Delete ${deletingDash.name}?`}
          message="The dash and all of its pages are removed. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null)
            void runAction(buildDashDelete(deletingDash.id))
          }}
        />
      )}
    </div>
  )
}

const deleteCategoryMessage = (count: number): string =>
  count === 0 ? 'The category is removed. No dashes are in it.' : `The category is removed; ${count === 1 ? 'its dash moves' : `its ${count} dashes move`} to Other.`

type DashItemProps = {
  layout: DashLayout
  onOpen: () => void
  onDelete: () => void
  /** `below` anchors the menu under the control (the ⋯) instead of at the pointer. */
  onMenu: (event: ReactMouseEvent<HTMLElement>, below: boolean) => void
}

/** Delete on a focused dash asks to delete it; Enter and Space open it (the button's own click). */
const onItemKeyDown =
  (onDelete: () => void) =>
  (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Delete') {
      event.preventDefault()
      onDelete()
    }
  }

function DashTile({ layout, onOpen, onDelete, onMenu }: DashItemProps) {
  return (
    <div className="card dashes-tile" onContextMenu={(event) => onMenu(event, false)}>
      <button type="button" className="dashes-tile-open" aria-label={`${layout.name}, ${dashSummary(layout)}`} onClick={onOpen} onKeyDown={onItemKeyDown(onDelete)}>
        <span className="dashes-tile-picture">
          <DashStill layout={layout} maxWidth={TILE_STILL.width} maxHeight={TILE_STILL.height} />
        </span>
        <span className="devices-tile-text">
          <span className="devices-name dashes-tile-name">{layout.name}</span>
          <span className="muted devices-line">{dashSummary(layout)}</span>
        </span>
      </button>
      <button type="button" className="icon-button dashes-tile-more" aria-label={`${layout.name} actions`} title="More" onClick={(event) => onMenu(event, true)}>
        <MoreHorizontal size={16} />
      </button>
    </div>
  )
}

function DashRow({ layout, onOpen, onDelete, onMenu }: DashItemProps) {
  return (
    <li>
      <button
        type="button"
        className="list-row dashes-columns dashes-row"
        onClick={onOpen}
        onKeyDown={onItemKeyDown(onDelete)}
        onContextMenu={(event) => onMenu(event, false)}
      >
        <span className="dashes-row-picture">
          <DashStill layout={layout} maxWidth={ROW_STILL.width} maxHeight={ROW_STILL.height} />
        </span>
        <span className="devices-name">{layout.name}</span>
        <span className="muted devices-line">{layoutScreenProfile(layout).name}</span>
        <span className="muted devices-line tabular">{formatPageCount(dashPageCount(layout))}</span>
        <ChevronRight size={14} className="devices-chevron" aria-hidden="true" />
      </button>
    </li>
  )
}
