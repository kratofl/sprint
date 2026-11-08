import { Eye, EyeOff, Group, Plus, Star, Trash2, Ungroup, X } from 'lucide-react'
import { nodeWidgets, shownChild, type DashGroupNode, type DashNode } from '@sprint/dashboard'
import type { DashGroupMode } from '@sprint/dashboard'
import { GeometryFields } from './controls'
import { addLayer, deleteNodes, nodeRect, setGroupMode, setHidden, setNodeRect, setShownFirst } from './groupOps'
import { nodeName } from './WidgetSidebar'
import type { Mutate } from './useDesignerDoc'

type Apply = (mutate: Mutate, group?: string) => boolean

const MODES: readonly { mode: DashGroupMode; label: string }[] = [
  { mode: 'together', label: 'All together' },
  { mode: 'oneAtATime', label: 'One at a time' },
]

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/**
 * The inspector for a selected group: its place and size (resizing scales its widgets), whether it
 * shows all its children or one at a time, and for one at a time (a widget stack) its layers with
 * the one the wheel shows first. Below: ungroup, rename, hide and delete, all as one.
 */
export function GroupInspector({
  pageId,
  node,
  apply,
  onSelect,
  onUngroup,
  onRename,
  onRefused,
}: {
  pageId: string
  node: DashGroupNode
  apply: Apply
  onSelect: (ids: string[]) => void
  onUngroup: () => void
  onRename: () => void
  onRefused: (message: string) => void
}) {
  const { group } = node
  const stack = group.mode === 'oneAtATime'
  const rect = nodeRect(node)
  const shown = stack ? shownChild(node) : null
  const hidden = group.hidden === true

  return (
    <aside className="designer-glass designer-inspector" aria-label={`${group.name} properties`}>
      <div className="designer-panel-head">
        <div className="designer-panel-intro">
          <h2 className="designer-panel-title">{group.name}</h2>
          <p className="field-hint">{stack ? `Stack · ${count(node.children.length, 'layer', 'layers')}` : `Group · ${count(nodeWidgets(node).length, 'widget', 'widgets')}`}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Deselect group" title="Deselect (Esc)" onClick={() => onSelect([])}>
          <X size={14} />
        </button>
      </div>

      {rect && (
        <div className="designer-group">
          <h3 className="designer-group-title">Position &amp; size</h3>
          <GeometryFields
            rect={rect}
            onChange={(next, field) => {
              if (!apply((current) => setNodeRect(current, pageId, node.id, next), `geometry:${node.id}:${field}`)) onRefused("Can't size it like that — its widgets would overlap.")
            }}
          />
        </div>
      )}

      <div className="designer-group">
        <h3 className="designer-group-title">Shows</h3>
        <div className="segmented designer-segmented-full" role="radiogroup" aria-label="Shows">
          {MODES.map((item) => (
            <button
              key={item.mode}
              type="button"
              role="radio"
              className="segmented-item"
              aria-checked={group.mode === item.mode}
              onClick={() => {
                if (group.mode !== item.mode && !apply((current) => setGroupMode(current, pageId, node.id, item.mode))) onRefused("Can't show them all together — its layers overlap. Move them apart first.")
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {stack && (
        <div className="designer-group">
          <h3 className="designer-group-title">Layers</h3>
          <ul className="designer-layers">
            {node.children.map((child) => {
              const first = shown?.id === child.id
              return (
                <li key={child.id} className="designer-layer">
                  <button type="button" className="designer-layer-main" onClick={() => onSelect([child.id])}>
                    <span className="designer-node-box is-layer" aria-hidden="true" />
                    <span className="designer-row-label">{nodeName(child)}</span>
                  </button>
                  {first ? (
                    <span className="designer-layer-first">
                      <Star size={12} /> Shown first
                    </span>
                  ) : (
                    <button type="button" className="designer-layer-make" onClick={() => apply((current) => setShownFirst(current, pageId, node.id, child.id))}>
                      Make first
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="button small subtle"
            onClick={() => {
              // The new layer is selected, so it is the one shown for arranging.
              const added: { id?: string } = {}
              const done = apply((current) => {
                const result = addLayer(current, pageId, node.id)
                added.id = result?.layerId
                return result?.layout ?? null
              })
              if (done && added.id !== undefined) onSelect([added.id])
            }}
          >
            <Plus /> Add layer
          </button>
          <p className="field-hint">The wheel shows {shown ? nodeName(shown) : 'nothing yet'}. Switching layers with a wheel button comes later.</p>
        </div>
      )}

      <div className="designer-group">
        <h3 className="designer-group-title">Group</h3>
        <div className="designer-button-row">
          <button type="button" className="button small" onClick={onUngroup}>
            <Ungroup /> Ungroup
          </button>
          <button type="button" className="button small" onClick={onRename}>
            Rename
          </button>
          <button type="button" className="button small" onClick={() => apply((current) => setHidden(current, pageId, [node.id], !hidden))}>
            {hidden ? <Eye /> : <EyeOff />} {hidden ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="button subtle destructive designer-inspector-delete"
        onClick={() => {
          apply((current) => deleteNodes(current, pageId, [node.id]))
          onSelect([])
        }}
      >
        <Trash2 /> Delete group
      </button>
    </aside>
  )
}

/** The inspector for several selected items: what they are, and grouping, hiding or deleting them as one. */
export function SelectionInspector({
  pageId,
  nodes,
  apply,
  onSelect,
  onGroup,
}: {
  pageId: string
  nodes: readonly DashNode[]
  apply: Apply
  onSelect: (ids: string[]) => void
  onGroup: () => void
}) {
  const ids = nodes.map((node) => node.id)
  const allWidgets = nodes.every((node) => node.kind === 'widget')
  const hidden = nodes.every((node) => (node.kind === 'group' ? node.group.hidden : node.widget.hidden) === true)
  const title = allWidgets ? count(nodes.length, 'widget', 'widgets') : count(nodes.length, 'item', 'items')

  return (
    <aside className="designer-glass designer-inspector" aria-label={`${title} selected`}>
      <div className="designer-panel-head">
        <div className="designer-panel-intro">
          <h2 className="designer-panel-title">{title}</h2>
          <p className="field-hint">{nodes.map(nodeName).join(', ')}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Deselect" title="Deselect (Esc)" onClick={() => onSelect([])}>
          <X size={14} />
        </button>
      </div>
      <div className="designer-group">
        <div className="designer-button-row">
          <button type="button" className="button small" onClick={onGroup}>
            <Group /> Group
          </button>
          <button type="button" className="button small" onClick={() => apply((current) => setHidden(current, pageId, ids, !hidden))}>
            {hidden ? <Eye /> : <EyeOff />} {hidden ? 'Show' : 'Hide'}
          </button>
        </div>
        <p className="field-hint">Group them to move them as one, or make the group switchable to show one layer at a time.</p>
      </div>
      <button
        type="button"
        className="button subtle destructive designer-inspector-delete"
        onClick={() => {
          apply((current) => deleteNodes(current, pageId, ids))
          onSelect([])
        }}
      >
        <Trash2 /> Delete
      </button>
    </aside>
  )
}
