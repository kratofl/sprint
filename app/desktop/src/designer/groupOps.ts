import { nodeWidgets, pageTree, shownChild, type DashGroupNode, type DashNode } from '@sprint/dashboard'
import type { DashGroupMode, DashLayout, DashPage, DashWidget, DashWidgetGroup } from '@sprint/dashboard'
import { findPage, isValidRect, nextId, nextName, pageFits, pageIdTaken, type GridRect, type WidgetTarget } from '../views/DashesDomain'

/**
 * The designer's group edits: grouping, ungrouping, moving in the tree, stacks and their layers,
 * and moving, resizing, copying, hiding or deleting a selection as one. Pure, like the
 * `DashesDomain` mutators: each takes the layout and returns a new one, or null when the edit is
 * not possible. An edit that would leave widgets overlapping where they may not (see `groups.ts`
 * in `@sprint/dashboard`) is refused.
 *
 * Tree edits re-arrange `pageTree` and write it back (`writeTree`), which keeps every group's
 * widgets together in `page.widgets` — the order the tree is read from.
 */

/** A node anywhere in the tree, or null. */
export function findNode(nodes: readonly DashNode[], id: string): DashNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.kind === 'group') {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

/** The nodes from the top of the tree down to `id` (itself last), or null when it is not there. */
export function nodePath(nodes: readonly DashNode[], id: string): DashNode[] | null {
  for (const node of nodes) {
    if (node.id === id) return [node]
    if (node.kind === 'group') {
      const below = nodePath(node.children, id)
      if (below) return [node, ...below]
    }
  }
  return null
}

/** The group a node sits in, or null on the page. */
export function parentGroup(nodes: readonly DashNode[], id: string): DashGroupNode | null {
  const path = nodePath(nodes, id)
  const parent = path && path.length > 1 ? path[path.length - 2] : null
  return parent?.kind === 'group' ? parent : null
}

/** Every node in sidebar order, depth first. */
export const flattenTree = (nodes: readonly DashNode[]): DashNode[] => nodes.flatMap((node) => (node.kind === 'group' ? [node, ...flattenTree(node.children)] : [node]))

/** The grid rectangle around a set of widgets; null for none (an empty group has no place). */
export function boundsOf(widgets: readonly DashWidget[]): GridRect | null {
  if (widgets.length === 0) return null
  const col = Math.min(...widgets.map((widget) => widget.col))
  const row = Math.min(...widgets.map((widget) => widget.row))
  const right = Math.max(...widgets.map((widget) => widget.col + widget.colSpan))
  const bottom = Math.max(...widgets.map((widget) => widget.row + widget.rowSpan))
  return { col, row, colSpan: right - col, rowSpan: bottom - row }
}

/** The selected nodes that are not inside another selected node, in sidebar order. */
export function topmost(nodes: readonly DashNode[], ids: readonly string[]): DashNode[] {
  const chosen = new Set(ids)
  const visit = (list: readonly DashNode[]): DashNode[] => list.flatMap((node) => (chosen.has(node.id) ? [node] : node.kind === 'group' ? visit(node.children) : []))
  return visit(nodes)
}

/** Every widget under the selected nodes, each once. */
export const selectionWidgets = (nodes: readonly DashNode[], ids: readonly string[]): DashWidget[] => topmost(nodes, ids).flatMap(nodeWidgets)

// ── Writing a re-arranged tree back ─────────────────────────────────────

function placeWidget(widget: DashWidget, parent: string | null): DashWidget {
  const next = { ...widget }
  if (parent === null) delete next.group
  else next.group = parent
  return next
}

function placeGroup(group: DashWidgetGroup, parent: string | null): DashWidgetGroup {
  const next = { ...group }
  if (parent === null) delete next.parent
  else next.parent = parent
  return next
}

/** The page with its widgets, groups and parent links taken from `roots`. */
function writeTree(page: DashPage, roots: readonly DashNode[]): DashPage {
  const widgets: DashWidget[] = []
  const groups: DashWidgetGroup[] = []
  const walk = (nodes: readonly DashNode[], parent: string | null): void => {
    for (const node of nodes) {
      if (node.kind === 'widget') {
        widgets.push(placeWidget(node.widget, parent))
      } else {
        groups.push(placeGroup(node.group, parent))
        walk(node.children, node.id)
      }
    }
  }
  walk(roots, null)
  return { ...page, widgets, groups }
}

/** Takes a node out of the tree; returns it, or null when it is not there. */
function detach(nodes: DashNode[], id: string): DashNode | null {
  const index = nodes.findIndex((node) => node.id === id)
  if (index >= 0) return nodes.splice(index, 1)[0] ?? null
  for (const node of nodes) {
    if (node.kind === 'group') {
      const found = detach(node.children, id)
      if (found) return found
    }
  }
  return null
}

const siblingsOf = (roots: DashNode[], parent: DashGroupNode | null): DashNode[] => (parent ? parent.children : roots)

/** Swaps the group object of a node in place (tree nodes are fresh per `pageTree` call). */
function patchGroup(nodes: readonly DashNode[], id: string, patch: (group: DashWidgetGroup) => DashWidgetGroup): boolean {
  const node = findNode(nodes, id)
  if (node?.kind !== 'group') return false
  node.group = patch(node.group)
  return true
}

function replacePage(layout: DashLayout, pageId: string, page: DashPage): DashLayout {
  if (layout.idlePage?.id === pageId) return { ...layout, idlePage: page }
  return { ...layout, pages: layout.pages.map((item) => (item.id === pageId ? page : item)) }
}

/** Runs a page edit and keeps it only when the page still fits the grid and its overlap rule. */
function editPage(layout: DashLayout, pageId: string, edit: (page: DashPage) => DashPage | null): DashLayout | null {
  const page = findPage(layout, pageId)
  const next = page ? edit(page) : null
  if (!next || !pageFits(next, layout.gridCols, layout.gridRows)) return null
  return replacePage(layout, pageId, next)
}

/** Runs a tree edit: `edit` re-arranges the fresh tree in place and says whether it could. */
const editTree = (layout: DashLayout, pageId: string, edit: (roots: DashNode[], page: DashPage) => boolean): DashLayout | null =>
  editPage(layout, pageId, (page) => {
    const roots = pageTree(page)
    return edit(roots, page) ? writeTree(page, roots) : null
  })

// ── Grouping ─────────────────────────────────────────────────────────────

const groupName = (page: DashPage, base: string): string => nextName(base, (name) => (page.groups ?? []).some((group) => group.name === name))

/**
 * Puts the selection into a new group, where its first node was (Ctrl+G). Refused when that would
 * merge layers of a stack, which overlap, into one.
 */
export function groupNodes(layout: DashLayout, pageId: string, ids: readonly string[]): { layout: DashLayout; groupId: string } | null {
  const page = findPage(layout, pageId)
  if (!page) return null
  const id = nextId('group', (candidate) => pageIdTaken(page, candidate))
  const next = editTree(layout, pageId, (roots) => {
    const chosen = topmost(roots, ids)
    const first = chosen[0]
    if (!first) return false
    const parent = parentGroup(roots, first.id)
    const siblings = siblingsOf(roots, parent)
    const node: DashGroupNode = { kind: 'group', id, group: { id, name: groupName(page, 'Group'), mode: 'together' }, children: [] }
    siblings.splice(siblings.indexOf(first), 0, node)
    for (const item of chosen) {
      detach(roots, item.id)
      node.children.push(item)
    }
    // A stack that showed one of them now shows the new group.
    if (parent?.group.shownFirst !== undefined && chosen.some((item) => item.id === parent.group.shownFirst)) {
      parent.group = { ...parent.group, shownFirst: id }
    }
    return true
  })
  return next ? { layout: next, groupId: id } : null
}

/** Dissolves a group into its parent, its children where it was (Ctrl+Shift+G). */
export function ungroup(layout: DashLayout, pageId: string, groupId: string): DashLayout | null {
  return editTree(layout, pageId, (roots) => {
    const node = findNode(roots, groupId)
    if (node?.kind !== 'group') return false
    const parent = parentGroup(roots, groupId)
    const siblings = siblingsOf(roots, parent)
    siblings.splice(siblings.indexOf(node), 1, ...node.children)
    if (parent && parent.group.shownFirst === groupId) {
      const first = node.children[0]
      parent.group = first ? { ...parent.group, shownFirst: first.id } : withoutShownFirst(parent.group)
    }
    return true
  })
}

function withoutShownFirst(group: DashWidgetGroup): DashWidgetGroup {
  const next = { ...group }
  delete next.shownFirst
  return next
}

/**
 * Moves a node into `parent` (null: the page), before `before` (null: at the end). Refused when it
 * would go inside itself, or leave widgets overlapping (a layer taken out of its stack).
 */
export function moveNode(layout: DashLayout, pageId: string, id: string, parent: string | null, before: string | null): DashLayout | null {
  if (id === before) return null
  return editTree(layout, pageId, (roots) => {
    const path = parent === null ? [] : nodePath(roots, parent)
    if (!path || path.some((node) => node.id === id)) return false
    const target = parent === null ? null : findNode(roots, parent)
    if (target !== null && target.kind !== 'group') return false
    const from = parentGroup(roots, id)
    const node = detach(roots, id)
    if (!node) return false
    if (from && from !== target && from.group.shownFirst === id) from.group = withoutShownFirst(from.group)
    const siblings = siblingsOf(roots, target)
    const index = before === null ? -1 : siblings.findIndex((item) => item.id === before)
    siblings.splice(index < 0 ? siblings.length : index, 0, node)
    return true
  })
}

export function renameGroup(layout: DashLayout, pageId: string, groupId: string, name: string): DashLayout | null {
  const trimmed = name.trim()
  const group = findPage(layout, pageId)?.groups?.find((item) => item.id === groupId)
  if (!trimmed || !group || group.name === trimmed) return null
  return editTree(layout, pageId, (roots) => patchGroup(roots, groupId, (item) => ({ ...item, name: trimmed })))
}

/** "All together" or "One at a time". Back to together is refused while its layers overlap. */
export function setGroupMode(layout: DashLayout, pageId: string, groupId: string, mode: DashGroupMode): DashLayout | null {
  if (findPage(layout, pageId)?.groups?.find((group) => group.id === groupId)?.mode === mode) return null
  return editTree(layout, pageId, (roots) => patchGroup(roots, groupId, (group) => ({ ...group, mode })))
}

/** Which layer a stack shows on the wheel until a button switches it. */
export function setShownFirst(layout: DashLayout, pageId: string, groupId: string, childId: string): DashLayout | null {
  return editTree(layout, pageId, (roots) => {
    const node = findNode(roots, groupId)
    if (node?.kind !== 'group' || node.group.shownFirst === childId || !node.children.some((child) => child.id === childId)) return false
    node.group = { ...node.group, shownFirst: childId }
    return true
  })
}

/** Adds an empty layer (a plain group) to a stack. */
export function addLayer(layout: DashLayout, pageId: string, stackId: string): { layout: DashLayout; layerId: string } | null {
  const page = findPage(layout, pageId)
  const stack = page?.groups?.find((group) => group.id === stackId)
  if (!page || !stack || stack.mode !== 'oneAtATime') return null
  const layerId = nextId('layer', (candidate) => pageIdTaken(page, candidate))
  const layer: DashWidgetGroup = { id: layerId, name: groupName(page, 'Layer'), parent: stackId, mode: 'together' }
  return { layout: replacePage(layout, pageId, { ...page, groups: [...(page.groups ?? []), layer] }), layerId }
}

/** Hides (or shows) the selection on the wheel. Hidden widgets keep their cells. */
export function setHidden(layout: DashLayout, pageId: string, ids: readonly string[], hidden: boolean): DashLayout | null {
  const chosen = new Set(ids)
  const page = findPage(layout, pageId)
  if (!page || ids.length === 0) return null
  const flag = <T extends { hidden?: boolean }>(item: T): T => {
    const next = { ...item }
    if (hidden) next.hidden = true
    else delete next.hidden
    return next
  }
  return replacePage(layout, pageId, {
    ...page,
    widgets: page.widgets.map((widget) => (chosen.has(widget.id) ? flag(widget) : widget)),
    groups: page.groups?.map((group) => (chosen.has(group.id) ? flag(group) : group)),
  })
}

/** Deletes the selection, groups with everything in them. */
export function deleteNodes(layout: DashLayout, pageId: string, ids: readonly string[]): DashLayout | null {
  const page = findPage(layout, pageId)
  if (!page) return null
  const chosen = topmost(pageTree(page), ids)
  if (chosen.length === 0) return null
  const gone = new Set(flattenTree(chosen).map((node) => node.id))
  const groups = (page.groups ?? []).filter((group) => !gone.has(group.id)).map((group) => (group.shownFirst !== undefined && gone.has(group.shownFirst) ? withoutShownFirst(group) : group))
  return replacePage(layout, pageId, { ...page, widgets: page.widgets.filter((widget) => !gone.has(widget.id)), groups })
}

// ── Geometry of a selection ─────────────────────────────────────────────

function moveWidgets(page: DashPage, moved: ReadonlySet<string>, place: (widget: DashWidget) => GridRect): DashPage {
  return { ...page, widgets: page.widgets.map((widget) => (moved.has(widget.id) ? { ...widget, ...place(widget) } : widget)) }
}

/** Moves the selection by whole cells, every layer of a stack with it. */
export function translateNodes(layout: DashLayout, pageId: string, ids: readonly string[], deltaCol: number, deltaRow: number): DashLayout | null {
  if (deltaCol === 0 && deltaRow === 0) return null
  return editPage(layout, pageId, (page) => {
    const moved = new Set(selectionWidgets(pageTree(page), ids).map((widget) => widget.id))
    if (moved.size === 0) return null
    return moveWidgets(page, moved, (widget) => ({ col: widget.col + deltaCol, row: widget.row + deltaRow, colSpan: widget.colSpan, rowSpan: widget.rowSpan }))
  })
}

/** Where an edge at `value` lands when the span `[from, from + fromSpan)` is scaled onto `[to, to + toSpan)`. */
const scaleEdge = (value: number, from: number, fromSpan: number, to: number, toSpan: number): number => to + Math.round(((value - from) * toSpan) / fromSpan)

/** The rectangle of a node (its bounds, for a group); null for an empty group. */
export function nodeRect(node: DashNode): GridRect | null {
  return node.kind === 'widget' ? node.widget : boundsOf(nodeWidgets(node))
}

/**
 * Gives a node a new rectangle. A group scales its widgets with it, still on the grid; refused when
 * that would make two of them overlap.
 */
export function setNodeRect(layout: DashLayout, pageId: string, id: string, rect: GridRect): DashLayout | null {
  if (!isValidRect(rect, layout.gridCols, layout.gridRows)) return null
  return editPage(layout, pageId, (page) => {
    const node = findNode(pageTree(page), id)
    const from = node ? nodeRect(node) : null
    if (!node || !from) return null
    const moved = new Set(nodeWidgets(node).map((widget) => widget.id))
    return moveWidgets(page, moved, (widget) => {
      const col = Math.min(scaleEdge(widget.col, from.col, from.colSpan, rect.col, rect.colSpan), rect.col + rect.colSpan - 1)
      const row = Math.min(scaleEdge(widget.row, from.row, from.rowSpan, rect.row, rect.rowSpan), rect.row + rect.rowSpan - 1)
      const right = scaleEdge(widget.col + widget.colSpan, from.col, from.colSpan, rect.col, rect.colSpan)
      const bottom = scaleEdge(widget.row + widget.rowSpan, from.row, from.rowSpan, rect.row, rect.rowSpan)
      return { col, row, colSpan: Math.max(1, right - col), rowSpan: Math.max(1, bottom - row) }
    })
  })
}

/**
 * Copies the selection as one, next to the originals in the tree, at the first free place on the
 * grid (row by row). Returns the copies' ids so they can be selected.
 */
export function duplicateNodes(layout: DashLayout, pageId: string, ids: readonly string[]): { layout: DashLayout; ids: string[] } | null {
  const page = findPage(layout, pageId)
  if (!page) return null
  const roots = pageTree(page)
  const chosen = topmost(roots, ids)
  const bounds = boundsOf(chosen.flatMap(nodeWidgets))
  const last = chosen[chosen.length - 1]
  if (!bounds || !last) return null

  const taken = new Set([...page.widgets.map((widget) => widget.id), ...(page.groups ?? []).map((group) => group.id)])
  const claim = (id: string): string => {
    const fresh = nextId(id, (candidate) => taken.has(candidate))
    taken.add(fresh)
    return fresh
  }
  const copy = (node: DashNode, deltaCol: number, deltaRow: number): DashNode => {
    if (node.kind === 'widget') {
      const id = claim(node.id)
      return { kind: 'widget', id, widget: { ...structuredClone(node.widget), id, col: node.widget.col + deltaCol, row: node.widget.row + deltaRow } }
    }
    const id = claim(node.id)
    const children = node.children.map((child) => copy(child, deltaCol, deltaRow))
    const shown = node.group.shownFirst === undefined ? -1 : node.children.findIndex((child) => child.id === node.group.shownFirst)
    const group: DashWidgetGroup = { ...node.group, id, name: groupName(page, node.group.name) }
    const shownCopy = children[shown]
    if (shownCopy) group.shownFirst = shownCopy.id
    else delete group.shownFirst
    return { kind: 'group', id, group, children }
  }

  for (let row = 0; row + bounds.rowSpan <= layout.gridRows; row++) {
    for (let col = 0; col + bounds.colSpan <= layout.gridCols; col++) {
      if (col === bounds.col && row === bounds.row) continue
      const fresh = new Set(taken)
      const copies = chosen.map((node) => copy(node, col - bounds.col, row - bounds.row))
      const tree = pageTree(page)
      const parent = parentGroup(tree, last.id)
      const siblings = siblingsOf(tree, parent)
      siblings.splice(siblings.findIndex((node) => node.id === last.id) + 1, 0, ...copies)
      const next = writeTree(page, tree)
      if (pageFits(next, layout.gridCols, layout.gridRows)) return { layout: replacePage(layout, pageId, next), ids: copies.map((node) => node.id) }
      // Not here: give the ids back for the next try.
      taken.clear()
      for (const id of fresh) taken.add(id)
    }
  }
  return null
}

// ── What the designer shows ──────────────────────────────────────────────

/**
 * The node a click on a drawn widget selects. Like folders: the outermost group, unless the
 * selection is already inside one of its groups, then the next level down.
 */
export function clickTarget(nodes: readonly DashNode[], widgetId: string, selection: readonly string[]): string {
  const path = nodePath(nodes, widgetId) ?? []
  const open = new Set<string>()
  for (const id of selection) for (const node of (nodePath(nodes, id) ?? []).slice(0, -1)) open.add(node.id)
  let target = path[0]?.id ?? widgetId
  for (let index = 1; index < path.length; index++) {
    const above = path[index - 1]
    const node = path[index]
    if (!above || !node || !open.has(above.id)) break
    target = node.id
  }
  return target
}

/** The stacks to show layer tabs for: those selected, or holding something selected. */
export function openStacks(nodes: readonly DashNode[], selection: readonly string[]): DashGroupNode[] {
  const open = new Map<string, DashGroupNode>()
  for (const id of selection) {
    for (const node of nodePath(nodes, id) ?? []) if (node.kind === 'group' && node.group.mode === 'oneAtATime') open.set(node.id, node)
  }
  return [...open.values()]
}

/**
 * The layer the designer shows for each stack: the one holding the selection, else the one picked
 * with the canvas tabs (`picked`), else the one the wheel shows.
 */
export function arrangedLayers(nodes: readonly DashNode[], selection: readonly string[], picked: ReadonlyMap<string, string>): Map<string, string> {
  const shown = new Map<string, string>()
  for (const node of flattenTree(nodes)) {
    if (node.kind !== 'group' || node.group.mode !== 'oneAtATime') continue
    const holding = node.children.find((child) => selection.some((id) => id === child.id || findNode(child.kind === 'group' ? child.children : [], id)))
    const choice = holding ?? node.children.find((child) => child.id === picked.get(node.id)) ?? shownChild(node)
    if (choice) shown.set(node.id, choice.id)
  }
  return shown
}

/** The page drawn with each stack showing the layer the designer arranges; never saved. */
export function withLayersShown(page: DashPage, shown: ReadonlyMap<string, string>): DashPage {
  if (shown.size === 0 || !page.groups) return page
  return { ...page, groups: page.groups.map((group) => (shown.has(group.id) ? { ...group, shownFirst: shown.get(group.id) } : group)) }
}

/**
 * Where a widget added from the library goes: into the selected group (or the selected widget's
 * group); in a stack, into the layer being arranged when that is a group. It is placed inside that
 * group's region when there is room.
 */
export function addTarget(nodes: readonly DashNode[], selection: readonly string[], shown: ReadonlyMap<string, string>): WidgetTarget {
  const only = selection.length === 1 ? selection[0] : undefined
  const selected = only === undefined ? null : findNode(nodes, only)
  let container = selected?.kind === 'group' ? selected : selected ? parentGroup(nodes, selected.id) : null
  const within = container ? (nodeRect(container) ?? undefined) : undefined
  if (container?.group.mode === 'oneAtATime') {
    const layer = container.children.find((child) => child.id === shown.get(container?.id ?? ''))
    container = layer?.kind === 'group' ? layer : null
  }
  return container ? { group: container.id, within } : { group: null }
}
