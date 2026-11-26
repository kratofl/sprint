import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { pageTree, resolvePreviewFrame, type DashGroupNode, type DashLayout, type DashNode, type DashPreviewState, type DashWidgetType, type GridSpan } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { addWidget, addWidgetAt } from '../views/DashesDomain'
import { DesignerCanvas, dropCell, type DragState, type PointerPos } from './DesignerCanvas'
import { swapWidgets } from '../views/DashesDomain'
import { GroupInspector, SelectionInspector } from './GroupInspector'
import { PageInspector, type ModeActions } from './PageInspector'
import { PagePicker } from './PagePicker'
import { WidgetInspector } from './WidgetInspector'
import { WidgetLibrary } from './WidgetLibrary'
import { addLayer, addTarget, arrangedLayers, deleteNodes, duplicateNodes, findNode, flattenTree, groupNodes, moveNode, openStacks, parentGroup, setHidden, stackOnto, topmost, translateNodes, ungroup, withLayersShown } from './groupOps'
import { NodeMenu } from './NodeMenu'
import type { MenuAnchor } from '../shell/Menu'
import { isInOverlay, isTypingTarget } from './keys'
import { shownPage } from './layoutOps'
import { BEZEL, useStageCanvas } from './useStageCanvas'
import type { CanvasView } from './CanvasViews'
import type { DesignerDocApi, Mutate } from './useDesignerDoc'

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/**
 * What the section shows round the widgets when it edits an overlay's instead of a page's (the
 * Pit limiter section): the picture under them, what sits above the stage, the panel while nothing
 * is selected (in place of the page's), and the spots the overlay covers. There is no page picker.
 */
export type OverlayStage = { backdrop: (width: number, height: number) => ReactNode; aboveStage: ReactNode; panel: ReactNode; covered: readonly GridSpan[] }

/**
 * The Layout section: the dash in a device-style bezel in the middle of the stage — its outline, or
 * the real dash faded back or tagged (`view`, the title bar picks) — the page picker over the widget library in the left pane, and
 * the selection's inspector in the right one. The dash is drawn at its real size when the window has room, smaller
 * otherwise. Keys (never while typing in a field): Delete removes the selection, the arrows move
 * it a cell, Ctrl+G groups it, Ctrl+Shift+G ungroups, Ctrl+D copies it, Escape deselects. A
 * right-click on a widget or group offers the same as a menu (`NodeMenu`), and moves it into a group. With nothing selected, the right panel is
 * the page's own (`PageInspector`): the sessions and modes it shows in, and when it jumps. With
 * an `overlay`, the same tools edit an overlay's widgets (`PitLimiterSection` hands it a doc whose
 * one page is the overlay).
 */
export function LayoutSection({
  doc,
  frame,
  chosenPageId,
  onChoosePage,
  modes,
  view,
  previewState,
  showGrid,
  overlay,
}: {
  doc: DesignerDocApi
  frame: TelemetryFrame | null
  /** The page being designed; kept by the window so it survives a trip to another section. */
  chosenPageId: string
  onChoosePage: (pageId: string) => void
  /** The driver's own dash modes, for the page panel and the page picker. */
  modes: ModeActions
  /** How the canvas shows the dash, what it shows and the grid: the toolbar's (`ViewTools`). */
  view: CanvasView
  previewState: DashPreviewState
  showGrid: boolean
  overlay?: OverlayStage
}) {
  const { layout, apply } = doc
  const [selection, setSelection] = useState<string[]>([])
  // The layer picked with a stack's canvas tabs, per stack; designer-only, never saved.
  const [picked, setPicked] = useState<ReadonlyMap<string, string>>(new Map())
  const [dragState, setDragState] = useState<DragState>({ kind: 'idle' })
  const [flash, setFlash] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; ids: string[] } | null>(null)
  const flashTimeout = useRef<number | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const { setFitElement, canvas } = useStageCanvas(layout)

  // Undo can take the page or the selection away; fall back instead of pointing at nothing.
  const page = shownPage(layout, chosenPageId)
  const pageId = page?.id ?? ''
  const isIdlePage = page !== null && page.id === layout.idlePage?.id
  const tree = useMemo<DashNode[]>(() => (page ? pageTree(page) : []), [page])
  const selected = selection.filter((id) => findNode(tree, id) !== null)
  const selectedNodes = topmost(tree, selected)
  const arranged = arrangedLayers(tree, selected, picked)
  const target = addTarget(tree, selected, arranged)

  // A one-shot note for a refused edit; it clears itself, never repeats.
  const flashValidation = (message: string): void => {
    setFlash(message)
    if (flashTimeout.current !== null) window.clearTimeout(flashTimeout.current)
    flashTimeout.current = window.setTimeout(() => setFlash(null), 2400)
  }
  useEffect(
    () => () => {
      if (flashTimeout.current !== null) window.clearTimeout(flashTimeout.current)
    },
    [],
  )

  const selectPage = (next: string): void => {
    onChoosePage(next)
    setSelection([])
    setDragState({ kind: 'idle' })
  }

  const commit = (mutate: Mutate, failureMessage: string): void => {
    if (!apply(mutate)) flashValidation(failureMessage)
  }

  /** Runs an edit that makes new items, then selects them. */
  const applyAndSelect = <T,>(make: (current: DashLayout) => { layout: DashLayout; value: T } | null, select: (value: T) => string[], failureMessage: string): void => {
    const made: { value?: T } = {}
    const done = apply((current) => {
      const result = make(current)
      if (result) made.value = result.value
      return result?.layout ?? null
    })
    if (done && made.value !== undefined) setSelection(select(made.value))
    else if (!done) flashValidation(failureMessage)
  }

  /** Groups the selection (Ctrl+G). */
  const groupSelection = (): void => {
    if (selected.length === 0) return
    applyAndSelect(
      (current) => {
        const result = groupNodes(current, pageId, selected)
        return result ? { layout: result.layout, value: result.groupId } : null
      },
      (groupId) => [groupId],
      "Can't group these — layers of a stack would end up overlapping.",
    )
  }

  /**
   * The groups the menu's nodes can move into: a group showing all its widgets that is not one
   * of them, not inside one of them, and not where all of them are already.
   */
  const moveTargets = (nodes: readonly DashNode[]): DashGroupNode[] => {
    const inside = new Set(flattenTree(nodes).map((node) => node.id))
    return flattenTree(tree).filter(
      (node): node is DashGroupNode => node.kind === 'group' && node.group.mode === 'together' && !inside.has(node.id) && !nodes.every((item) => parentGroup(tree, item.id)?.id === node.id),
    )
  }

  const moveInto = (groupId: string): void => {
    const ids = topmost(tree, selected).map((node) => node.id)
    const moved = apply((current) => ids.reduce<DashLayout | null>((next, id) => (next ? moveNode(next, pageId, id, groupId, null) : null), current))
    if (!moved) flashValidation("Can't move it there — it would overlap a widget it can't share space with.")
  }

  /** Puts the selection into a new stack: one layer shown at a time. */
  const stackSelection = (): void => {
    if (selected.length === 0) return
    applyAndSelect(
      (current) => {
        const result = groupNodes(current, pageId, selected, 'oneAtATime')
        return result ? { layout: result.layout, value: result.groupId } : null
      },
      (groupId) => [groupId],
      "Can't stack these — layers of a stack would end up overlapping.",
    )
  }

  /** A widget dropped onto another on the canvas: they become layers of one stack, in its cell. */
  const stackWidgetOnto = (id: string, targetId: string): void => {
    applyAndSelect(
      (current) => {
        const result = stackOnto(current, pageId, id, targetId)
        return result ? { layout: result.layout, value: id } : null
      },
      (dropped) => [dropped],
      "Can't stack it there.",
    )
  }

  const swapWidget = (id: string, targetId: string): void => {
    applyAndSelect(
      (current) => {
        const swapped = swapWidgets(current, pageId, id, targetId)
        return swapped ? { layout: swapped, value: id } : null
      },
      (dropped) => [dropped],
      "Can't swap those two — one of them doesn't fit the other's place.",
    )
  }

  /** Right-click: the menu acts on the selection, which takes the clicked node first; empty space deselects. */
  const openMenu = (id: string | null, anchor: MenuAnchor): void => {
    if (id === null) {
      setSelection([])
      return
    }
    const ids = selected.includes(id) ? selected : [id]
    if (!selected.includes(id)) setSelection(ids)
    setMenu({ anchor, ids })
  }

  const ungroupSelection = (): void => {
    const groups = selectedNodes.filter((node) => node.kind === 'group')
    if (groups.length === 0) return
    const children = groups.flatMap((node) => (node.kind === 'group' ? node.children.map((child) => child.id) : []))
    const done = apply((current) => groups.reduce<DashLayout | null>((next, node) => (next ? ungroup(next, pageId, node.id) : null), current))
    if (done) setSelection(children)
    else flashValidation("Can't ungroup a stack whose layers overlap — move them apart first.")
  }

  const duplicateSelection = (): void => {
    if (selected.length === 0) return
    applyAndSelect(
      (current) => {
        const result = duplicateNodes(current, pageId, selected)
        return result ? { layout: result.layout, value: result.ids } : null
      },
      (ids) => ids,
      'There is no free space on this page for a copy.',
    )
  }

  const addLayerTo = (stackId: string): void => {
    applyAndSelect(
      (current) => {
        const result = addLayer(current, pageId, stackId)
        return result ? { layout: result.layout, value: result.layerId } : null
      },
      (layerId) => [layerId],
      "Can't add a layer here.",
    )
  }

  const addAndSelect = (type: DashWidgetType, cell: { col: number; row: number } | null): void => {
    const result = cell ? addWidgetAt(layout, pageId, type, cell.col, cell.row, target.group) : addWidget(layout, pageId, type, target)
    if (!result || !apply(() => result.layout)) {
      flashValidation(cell ? "It doesn't fit there — drop it onto free space big enough for it." : 'There is no free space on this page for another widget.')
      return
    }
    setSelection([result.widget.id])
  }

  const onDrop = (type: DashWidgetType, pointer: PointerPos): void => {
    if (!canvas || !page) return
    addAndSelect(type, dropCell(layout, pointer, canvas.width, canvas.height))
  }

  // The designer's keys, from anywhere in the window but a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // A dialog or menu owns its keys: Delete in a confirm must not delete the selection behind it.
      if (event.defaultPrevented || isTypingTarget(event.target) || isInOverlay(event.target) || event.altKey) return
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase()
        if (key === 'g') {
          event.preventDefault()
          setMenu(null)
          if (event.shiftKey) ungroupSelection()
          else groupSelection()
        } else if (key === 'd' && !event.shiftKey) {
          event.preventDefault()
          duplicateSelection()
        }
        return
      }
      if (event.key === 'Escape') {
        if (selected.length > 0) setSelection([])
        else return
        event.preventDefault()
        return
      }
      if (selected.length === 0) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        apply((current) => deleteNodes(current, pageId, selected))
        setSelection([])
        return
      }
      const arrow = ARROWS[event.key]
      // A select keeps its own arrow keys.
      if (!arrow || event.shiftKey || event.target instanceof HTMLSelectElement) return
      event.preventDefault()
      // A run of nudges on one selection is one undo step.
      apply((current) => translateNodes(current, pageId, selected, arrow[0], arrow[1]), `nudge:${selected.join(',')}`)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const frameShown = resolvePreviewFrame(previewState, frame)
  const only = selectedNodes.length === 1 ? selectedNodes[0] : undefined

  const stage =
    page && canvas ? (
      <div className="designer-bezel" style={{ padding: BEZEL }}>
        <DesignerCanvas
          canvasRef={canvasRef}
          layout={layout}
          page={page}
          shownPage={withLayersShown(page, arranged)}
          tree={tree}
          isIdlePage={isIdlePage}
          frame={frameShown}
          width={canvas.width}
          height={canvas.height}
          showGrid={overlay ? false : showGrid}
          view={overlay ? 'preview' : view}
          selection={selected}
          onSelect={setSelection}
          stacks={openStacks(tree, selected)}
          arranged={arranged}
          onPickLayer={(stackId, layerId) => {
            setPicked(new Map(picked).set(stackId, layerId))
            setSelection([layerId])
          }}
          onAddLayer={addLayerTo}
          onGroup={groupSelection}
          onStackOnto={stackWidgetOnto}
          onSwap={swapWidget}
          onMenu={openMenu}
          placeGroup={target.group}
          dragState={dragState}
          setDragState={setDragState}
          commit={commit}
          backdrop={overlay?.backdrop}
          covered={overlay?.covered}
          resizeTracks={!overlay}
        />
      </div>
    ) : (
      !page && <p className="muted">This dash has no pages yet.</p>
    )

  return (
    <>
      {page && (
        <WidgetLibrary
          isIdlePage={isIdlePage}
          canvasRef={canvasRef}
          canvasWidth={canvas?.width ?? 0}
          canvasHeight={canvas?.height ?? 0}
          dragState={dragState}
          setDragState={setDragState}
          onAdd={(type) => addAndSelect(type, null)}
          onDrop={onDrop}
          head={!overlay && <PagePicker layout={layout} pageId={page.id} onSelectPage={selectPage} apply={apply} modes={modes.modes} />}
        />
      )}

      {overlay ? (
        <div className="designer-fit is-stacked">
          {overlay.aboveStage}
          <div ref={setFitElement} className="designer-fit-box">
            {stage}
          </div>
        </div>
      ) : (
        <div ref={setFitElement} className="designer-fit">
          {stage}
        </div>
      )}

      {only?.kind === 'widget' && (
        <WidgetInspector key={only.id} layout={layout} pageId={pageId} widget={only.widget} apply={apply} onDeselect={() => setSelection([])} />
      )}
      {only?.kind === 'group' && (
        <GroupInspector
          key={only.id}
          pageId={pageId}
          node={only}
          apply={apply}
          onSelect={setSelection}
          onUngroup={ungroupSelection}
          onRefused={flashValidation}
        />
      )}
      {selectedNodes.length === 0 && (overlay ? overlay.panel : page && <PageInspector key={page.id} layout={layout} page={page} isIdlePage={isIdlePage} apply={apply} modes={modes} />)}
      {selectedNodes.length > 1 && <SelectionInspector pageId={pageId} nodes={selectedNodes} apply={apply} onSelect={setSelection} onGroup={groupSelection} />}

      {menu && (
        <NodeMenu
          menu={{ anchor: menu.anchor, nodes: topmost(tree, menu.ids) }}
          groups={moveTargets(topmost(tree, menu.ids))}
          onClose={() => setMenu(null)}
          onGroup={groupSelection}
          onStack={stackSelection}
          onMoveInto={moveInto}
          onUngroup={ungroupSelection}
          onDuplicate={duplicateSelection}
          onHide={(hidden) => apply((current) => setHidden(current, pageId, selected, hidden))}
          onDelete={() => {
            apply((current) => deleteNodes(current, pageId, selected))
            setSelection([])
          }}
        />
      )}

      {flash && (
        <div className="infobar warning designer-notice" role="status">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <span className="infobar-message">{flash}</span>
        </div>
      )}
    </>
  )
}
