// A page's widgets organised into groups: the tree the designer's sidebar shows and the rule for
// which widgets the wheel draws. Pure, no React. The Rust renderer applies the same rule
// (renderer/src/groups.rs, tests ported from groups.test.ts); the designer uses this copy.
//
// The model is flat on purpose. `page.widgets` holds every widget in page grid coordinates, in
// draw order; a widget's `group` names its group, a group's `parent` names the group it sits in.
// The order of a group among its siblings is not stored: it is where its first widget sits in
// `page.widgets` (the designer keeps each group's widgets together). An empty group has no widget
// to place it, so it comes after its non-empty siblings, in `page.groups` order.
//
// A group "one at a time" is a widget stack: each direct child (a widget or a group) is a layer,
// and only `shownFirst` (else the first child) is drawn. Layers of one stack are the only widgets
// allowed to overlap (`mayOverlap`); everything else keeps the page's no-overlap rule. A hidden
// widget or group is not drawn but still holds its place on the grid.

import type { DashPage, DashWidget, DashWidgetGroup } from './index'

export type DashNode =
  | { kind: 'widget'; id: string; widget: DashWidget }
  | { kind: 'group'; id: string; group: DashWidgetGroup; children: DashNode[] }

export type DashGroupNode = Extract<DashNode, { kind: 'group' }>

/** Each group's parent as it is drawn: a missing parent, or one that would make a cycle, is the page itself (null). */
export function groupParents(page: DashPage): Map<string, string | null> {
  const groups = new Map<string, DashWidgetGroup>()
  for (const group of page.groups ?? []) if (!groups.has(group.id)) groups.set(group.id, group)
  const parents = new Map<string, string | null>()
  for (const group of groups.values()) {
    let parent = group.parent !== undefined && groups.has(group.parent) ? group.parent : null
    // Walk up from the parent; meeting this group again means a cycle, so it sits on the page.
    const seen = new Set<string>([group.id])
    for (let at = parent; at !== null; ) {
      if (seen.has(at)) {
        parent = null
        break
      }
      seen.add(at)
      const up = groups.get(at)?.parent
      at = up !== undefined && groups.has(up) ? up : null
    }
    parents.set(group.id, parent)
  }
  return parents
}

/** The group a widget is drawn in, or null when it sits on the page (no group, or one that does not exist). */
const widgetParent = (widget: DashWidget, parents: Map<string, string | null>): string | null => (widget.group !== undefined && parents.has(widget.group) ? widget.group : null)

/** The page as a tree, siblings in sidebar (= draw) order. */
export function pageTree(page: DashPage): DashNode[] {
  const parents = groupParents(page)
  const groupList = (page.groups ?? []).filter((group, index, all) => all.findIndex((other) => other.id === group.id) === index)
  const children = new Map<string | null, { node: DashNode; key: number; tie: number }[]>()
  const push = (parent: string | null, entry: { node: DashNode; key: number; tie: number }): void => {
    const list = children.get(parent)
    if (list) list.push(entry)
    else children.set(parent, [entry])
  }

  page.widgets.forEach((widget, index) => push(widgetParent(widget, parents), { node: { kind: 'widget', id: widget.id, widget }, key: index, tie: -1 }))

  // A group sorts by its first widget, found by walking each widget up through its groups.
  const firstWidget = new Map<string, number>()
  page.widgets.forEach((widget, index) => {
    for (let at = widgetParent(widget, parents); at !== null; at = parents.get(at) ?? null) {
      if (!firstWidget.has(at)) firstWidget.set(at, index)
    }
  })

  const groupNodes = new Map<string, DashGroupNode>()
  groupList.forEach((group, index) => {
    const node: DashGroupNode = { kind: 'group', id: group.id, group, children: [] }
    groupNodes.set(group.id, node)
    push(parents.get(group.id) ?? null, { node, key: firstWidget.get(group.id) ?? Number.POSITIVE_INFINITY, tie: index })
  })

  const ordered = (parent: string | null): DashNode[] =>
    (children.get(parent) ?? []).sort((a, b) => a.key - b.key || a.tie - b.tie).map((entry) => entry.node)
  for (const [id, node] of groupNodes) node.children = ordered(id)
  return ordered(null)
}

/** The layer a one-at-a-time group draws: its `shownFirst` child while that exists, else its first. */
export function shownChild(node: DashGroupNode): DashNode | null {
  return node.children.find((child) => child.id === node.group.shownFirst) ?? node.children[0] ?? null
}

/** Every widget under a node (itself, for a widget), in draw order, hidden or not. */
export function nodeWidgets(node: DashNode): DashWidget[] {
  return node.kind === 'widget' ? [node.widget] : node.children.flatMap(nodeWidgets)
}

/** The widgets the wheel draws, in draw order: not hidden, in no hidden group, and in each stack only under the layer it shows. */
export function drawnWidgets(page: DashPage): DashWidget[] {
  const visit = (node: DashNode): DashWidget[] => {
    if (node.kind === 'widget') return node.widget.hidden ? [] : [node.widget]
    if (node.group.hidden) return []
    if (node.group.mode !== 'oneAtATime') return node.children.flatMap(visit)
    const layer = shownChild(node)
    return layer ? visit(layer) : []
  }
  return pageTree(page).flatMap(visit)
}

/**
 * For a widget (or a widget about to be added to `group`), the layer it is in for each stack above
 * it: stack id → the id of the stack's child it descends from. `selfId` is the widget's own id,
 * its layer when it sits directly in a stack.
 */
export function stackLayers(page: DashPage, group: string | null, selfId: string, parents: Map<string, string | null> = groupParents(page)): Map<string, string> {
  const modes = new Map((page.groups ?? []).map((item) => [item.id, item.mode] as const))
  const layers = new Map<string, string>()
  let below = selfId
  for (let at = group !== null && parents.has(group) ? group : null; at !== null; at = parents.get(at) ?? null) {
    if (modes.get(at) === 'oneAtATime' && !layers.has(at)) layers.set(at, below)
    below = at
  }
  return layers
}

/** Whether two widgets may share grid cells: only when they sit in different layers of one stack. */
export function mayOverlap(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  for (const [stack, layer] of a) {
    const other = b.get(stack)
    if (other !== undefined && other !== layer) return true
  }
  return false
}
