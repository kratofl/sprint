import { useEffect, useMemo, useRef, useState } from 'react'
import { pageTree, resolvePreviewFrame, type DashLayout, type DashNode, type DashPreviewState, type DashWidgetType } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { addWidget, addWidgetAt } from '../views/DashesDomain'
import { DesignerCanvas, dropCell, type DragState, type PointerPos } from './DesignerCanvas'
import { GroupInspector, SelectionInspector } from './GroupInspector'
import { PageDock } from './PageDock'
import { WidgetInspector } from './WidgetInspector'
import { WidgetLibrary } from './WidgetLibrary'
import { WidgetSidebar } from './WidgetSidebar'
import { addLayer, addTarget, arrangedLayers, deleteNodes, duplicateNodes, findNode, groupNodes, openStacks, topmost, translateNodes, ungroup, withLayersShown } from './groupOps'
import { isInOverlay, isTypingTarget } from './keys'
import { shownPage } from './layoutOps'
import { BEZEL, useStageCanvas } from './useStageCanvas'
import type { DesignerDocApi, Mutate } from './useDesignerDoc'

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/**
 * The Layout section: the live dash in a device-style bezel in the middle of the stage, the page's
 * widgets and groups in a tree on the left, the selection's inspector on the right and the page
 * dock at the bottom. The dash is drawn at its real size when the window has room, smaller
 * otherwise. Keys (never while typing in a field): Delete removes the selection, the arrows move
 * it a cell, Ctrl+G groups it, Ctrl+Shift+G ungroups, Ctrl+D copies it, Escape deselects.
 */
export function LayoutSection({
  doc,
  frame,
  chosenPageId,
  onChoosePage,
}: {
  doc: DesignerDocApi
  frame: TelemetryFrame | null
  /** The page being designed; kept by the window so it survives a trip to another section. */
  chosenPageId: string
  onChoosePage: (pageId: string) => void
}) {
  const { layout, apply } = doc
  const [selection, setSelection] = useState<string[]>([])
  // The layer picked with a stack's canvas tabs, per stack; designer-only, never saved.
  const [picked, setPicked] = useState<ReadonlyMap<string, string>>(new Map())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState>({ kind: 'idle' })
  const [showGrid, setShowGrid] = useState(false)
  const [previewState, setPreviewState] = useState<DashPreviewState>('live')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
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
      flashValidation(cell ? 'That cell is occupied — drop onto free space.' : 'There is no free space on this page for another widget.')
      return
    }
    setSelection([result.widget.id])
    setLibraryOpen(false)
  }

  const onDrop = (type: DashWidgetType, pointer: PointerPos): void => {
    if (!canvas) return
    const cols = layout.gridCols > 0 ? layout.gridCols : 20
    const rows = layout.gridRows > 0 ? layout.gridRows : 12
    addAndSelect(type, dropCell(pointer, canvas.width / cols, canvas.height / rows, cols, rows))
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
          if (event.shiftKey) ungroupSelection()
          else groupSelection()
        } else if (key === 'd' && !event.shiftKey) {
          event.preventDefault()
          duplicateSelection()
        }
        return
      }
      if (event.key === 'Escape') {
        if (libraryOpen) setLibraryOpen(false)
        else if (selected.length > 0) setSelection([])
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

  return (
    <>
      {page && (
        <WidgetSidebar
          page={page}
          tree={tree}
          isIdlePage={isIdlePage}
          apply={apply}
          selection={selected}
          onSelect={setSelection}
          renaming={renaming}
          onRename={setRenaming}
          onGroup={groupSelection}
          onRefused={flashValidation}
        />
      )}

      <div ref={setFitElement} className="designer-fit">
        {page && canvas ? (
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
              showGrid={showGrid}
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
              placeGroup={target.group}
              dragState={dragState}
              setDragState={setDragState}
              commit={commit}
            />
          </div>
        ) : (
          !page && <p className="muted">This dash has no pages yet.</p>
        )}
      </div>

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
          onRename={() => setRenaming(only.id)}
          onRefused={flashValidation}
        />
      )}
      {selectedNodes.length > 1 && <SelectionInspector pageId={pageId} nodes={selectedNodes} apply={apply} onSelect={setSelection} onGroup={groupSelection} />}

      {flash && (
        <div className="infobar warning designer-notice" role="status">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <span className="infobar-message">{flash}</span>
        </div>
      )}

      {libraryOpen && page && canvas && (
        <WidgetLibrary
          isIdlePage={isIdlePage}
          canvasRef={canvasRef}
          canvasWidth={canvas.width}
          canvasHeight={canvas.height}
          dragState={dragState}
          setDragState={setDragState}
          onAdd={(type) => addAndSelect(type, null)}
          onDrop={onDrop}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      <PageDock
        layout={layout}
        pageId={pageId}
        onSelectPage={selectPage}
        apply={apply}
        libraryOpen={libraryOpen}
        onToggleLibrary={() => setLibraryOpen((open) => !open)}
        previewState={previewState}
        onPreviewState={setPreviewState}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((value) => !value)}
      />
    </>
  )
}
