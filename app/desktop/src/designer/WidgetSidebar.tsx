import { useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { ChevronRight, Eye, EyeOff, Folder, Group, Layers, Star, Trash2 } from 'lucide-react'
import { nodeWidgets, shownChild, type DashGroupNode, type DashNode } from '@sprint/dashboard'
import type { DashPage } from '@sprint/dashboard'
import { widgetDisplayName } from '../views/DashesDomain'
import { blurOnEnter } from './controls'
import { deleteNodes, flattenTree, moveNode, parentGroup, renameGroup, setHidden } from './groupOps'
import type { Mutate } from './useDesignerDoc'

type Apply = (mutate: Mutate, group?: string) => boolean

/** What a sidebar row is called: a group's name, a widget's catalog name. */
export const nodeName = (node: DashNode): string => (node.kind === 'group' ? node.group.name : widgetDisplayName(node.widget.type))

/** Where a dragged row lands, relative to the row under the pointer. */
type DropZone = { id: string; zone: 'before' | 'after' | 'into' }

/**
 * The floating sidebar on the left: the page's widgets and groups as a tree, in draw order. A row
 * selects (Ctrl/Cmd-click adds or removes, Shift-click takes a range), a chevron folds a group,
 * a double-click on a group renames it, and rows drag to reorder or into a group. Hover (or
 * focus) shows hide and delete in place of the row's count; a hidden row keeps a crossed-out eye.
 */
export function WidgetSidebar({
  page,
  tree,
  isIdlePage,
  apply,
  selection,
  onSelect,
  renaming,
  onRename,
  onGroup,
  onRefused,
}: {
  page: DashPage
  tree: DashNode[]
  isIdlePage: boolean
  apply: Apply
  selection: readonly string[]
  onSelect: (ids: string[]) => void
  /** The group whose name is being edited inline, if any. */
  renaming: string | null
  onRename: (id: string | null) => void
  onGroup: () => void
  onRefused: (message: string) => void
}) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [drop, setDrop] = useState<DropZone | null>(null)
  const dragging = useRef<string | null>(null)
  const anchor = useRef<string | null>(null)

  // The rows on screen, for Shift-click ranges.
  const visible: DashNode[] = []
  const collect = (nodes: readonly DashNode[]): void => {
    for (const node of nodes) {
      visible.push(node)
      if (node.kind === 'group' && !folded.has(node.id)) collect(node.children)
    }
  }
  collect(tree)

  const select = (node: DashNode, event: ReactMouseEvent): void => {
    if (event.ctrlKey || event.metaKey) {
      onSelect(selection.includes(node.id) ? selection.filter((id) => id !== node.id) : [...selection, node.id])
      anchor.current = node.id
      return
    }
    const from = anchor.current === null ? -1 : visible.findIndex((item) => item.id === anchor.current)
    if (event.shiftKey && from >= 0) {
      const to = visible.findIndex((item) => item.id === node.id)
      onSelect(visible.slice(Math.min(from, to), Math.max(from, to) + 1).map((item) => item.id))
      return
    }
    anchor.current = node.id
    onSelect([node.id])
  }

  const toggleFold = (id: string): void => {
    const next = new Set(folded)
    if (!next.delete(id)) next.add(id)
    setFolded(next)
  }

  const zoneAt = (node: DashNode, event: ReactDragEvent<HTMLElement>): DropZone['zone'] => {
    const rect = event.currentTarget.getBoundingClientRect()
    const at = (event.clientY - rect.top) / rect.height
    if (node.kind === 'group') return at < 0.25 ? 'before' : at > 0.75 && (folded.has(node.id) || node.children.length === 0) ? 'after' : 'into'
    return at < 0.5 ? 'before' : 'after'
  }

  const onDrop = (target: DashNode, zone: DropZone['zone']): void => {
    const id = dragging.current
    dragging.current = null
    setDrop(null)
    if (id === null || id === target.id) return
    const parent = parentGroup(tree, target.id)
    const siblings = parent ? parent.children : tree
    const next = siblings[siblings.findIndex((item) => item.id === target.id) + 1]
    const moved =
      zone === 'into'
        ? apply((current) => moveNode(current, page.id, id, target.id, null))
        : apply((current) => moveNode(current, page.id, id, parent?.id ?? null, zone === 'before' ? target.id : (next?.id ?? null)))
    if (!moved) onRefused("Can't move it there — it would overlap a widget it can't share space with.")
  }

  const row = (node: DashNode, depth: number, parent: DashGroupNode | null): ReactNode => {
    const selected = selection.includes(node.id)
    const name = nodeName(node)
    const hidden = node.kind === 'group' ? node.group.hidden === true : node.widget.hidden === true
    const isStack = node.kind === 'group' && node.group.mode === 'oneAtATime'
    const shownFirst = parent?.group.mode === 'oneAtATime' && shownChild(parent)?.id === node.id
    const open = node.kind === 'group' && !folded.has(node.id)
    const dropHere = drop?.id === node.id ? ` drop-${drop.zone}` : ''
    return (
      <li key={node.id} role="none">
        <div
          className={`designer-node${selected ? ' selected' : ''}${hidden ? ' is-hidden' : ''}${dropHere}`}
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={selected}
          aria-expanded={node.kind === 'group' ? open : undefined}
          draggable={renaming !== node.id}
          onDragStart={(event) => {
            dragging.current = node.id
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', node.id)
          }}
          onDragEnd={() => {
            dragging.current = null
            setDrop(null)
          }}
          onDragOver={(event) => {
            if (dragging.current === null || dragging.current === node.id) return
            event.preventDefault()
            const zone = zoneAt(node, event)
            if (drop?.id !== node.id || drop.zone !== zone) setDrop({ id: node.id, zone })
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) setDrop(null)
          }}
          onDrop={(event) => {
            event.preventDefault()
            onDrop(node, zoneAt(node, event))
          }}
        >
          <span className="designer-node-indent" style={{ width: depth * 16 }} aria-hidden="true" />
          {node.kind === 'group' ? (
            <button type="button" className="designer-node-fold" aria-label={open ? `Fold ${name}` : `Unfold ${name}`} onClick={() => toggleFold(node.id)}>
              <ChevronRight size={14} className={open ? 'is-open' : undefined} />
            </button>
          ) : (
            <span className="designer-node-fold" aria-hidden="true" />
          )}
          {renaming === node.id && node.kind === 'group' ? (
            <input
              className="designer-node-rename"
              aria-label="Group name"
              defaultValue={node.group.name}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  // Cancel: put the name back so the blur that follows changes nothing.
                  event.stopPropagation()
                  event.currentTarget.value = node.group.name
                  event.currentTarget.blur()
                } else blurOnEnter(event)
              }}
              onBlur={(event) => {
                const value = event.target.value
                onRename(null)
                apply((current) => renameGroup(current, page.id, node.id, value))
              }}
            />
          ) : (
            <button
              type="button"
              className="designer-node-main"
              onClick={(event) => select(node, event)}
              onDoubleClick={() => {
                if (node.kind === 'group') onRename(node.id)
              }}
            >
              {node.kind === 'widget' ? (
                <span className={parent?.group.mode === 'oneAtATime' ? 'designer-node-box is-layer' : 'designer-node-box'} aria-hidden="true" />
              ) : isStack ? (
                <Layers size={14} className="designer-node-stack" />
              ) : (
                <Folder size={14} className="designer-node-folder" />
              )}
              <span className="designer-row-label">{name}</span>
              {isStack ? <span className="designer-node-meta">one at a time</span> : node.kind === 'group' && <span className="designer-node-meta tabular">{nodeWidgets(node).length}</span>}
              {shownFirst && <Star size={12} className="designer-node-star" aria-label="Shown first" />}
            </button>
          )}
          {hidden && <EyeOff size={14} className="designer-node-hidden" aria-label="Hidden on the wheel" />}
          <span className="designer-node-actions">
            <button
              type="button"
              className="icon-button designer-node-action"
              aria-label={hidden ? `Show ${name} on the wheel` : `Hide ${name} on the wheel`}
              title={hidden ? 'Show on the wheel' : 'Hide on the wheel'}
              onClick={() => apply((current) => setHidden(current, page.id, [node.id], !hidden))}
            >
              {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button
              type="button"
              className="icon-button designer-node-action"
              aria-label={`Delete ${name}`}
              title={`Delete ${name}`}
              onClick={() => {
                apply((current) => deleteNodes(current, page.id, [node.id]))
                const gone = new Set(flattenTree([node]).map((item) => item.id))
                if (selection.some((id) => gone.has(id))) onSelect(selection.filter((id) => !gone.has(id)))
              }}
            >
              <Trash2 size={14} />
            </button>
          </span>
        </div>
        {node.kind === 'group' && open && node.children.length > 0 && (
          <ul className="designer-tree" role="group">
            {node.children.map((child) => row(child, depth + 1, node))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <aside className="designer-glass designer-sidebar" aria-label="Widgets on this page">
      <div className="designer-sidebar-head">
        <span className="designer-sidebar-page">{page.name}</span>
        <span className="muted">{isIdlePage ? 'idle page' : 'page'}</span>
        <button type="button" className="icon-button designer-sidebar-group" aria-label="Group the selection" title="Group (Ctrl+G)" disabled={selection.length === 0} onClick={onGroup}>
          <Group size={14} />
        </button>
      </div>

      <div className="designer-sidebar-body">
        {tree.length === 0 ? (
          <p className="field-hint designer-sidebar-empty">No widgets yet. Add one with Widget below.</p>
        ) : (
          <ul className="designer-tree" role="tree" aria-label="Widgets and groups" aria-multiselectable="true">
            {tree.map((node) => row(node, 0, null))}
          </ul>
        )}
      </div>
      {tree.length > 0 && <p className="field-hint designer-sidebar-foot">Drag to reorder or into a group</p>}
    </aside>
  )
}
