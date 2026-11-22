import { Eye, EyeOff, Group, Plus, Star, Trash2, Ungroup, X } from 'lucide-react'
import { nodeWidgets, shownChild, type DashGroupNode, type DashNode } from '@sprint/dashboard'
import type { DashGroupMode, DashGroupStyle } from '@sprint/dashboard'
import { BORDER_OPTIONS, GROUP_LABEL_OPTIONS, GeometryFields, Segmented, blurOnEnter } from './controls'
import { addLayer, deleteNodes, nodeRect, renameGroup, setGroupMode, setGroupStyle, setHidden, setNodeRect, setShownFirst, takeOutOfGroup } from './groupOps'
import { NodeIcon, nodeName } from './NodeLabel'
import type { Mutate } from './useDesignerDoc'

type Apply = (mutate: Mutate, group?: string) => boolean

const MODES: readonly { mode: DashGroupMode; label: string }[] = [
  { mode: 'together', label: 'All together' },
  { mode: 'oneAtATime', label: 'One at a time' },
]

/** A group with no frame of its own yet: no edge, no label, the name at the left. */
const NO_GROUP_FRAME: DashGroupStyle = { border: 'none', label: 'off', align: 'start' }

const ALIGN_OPTIONS: ReadonlyArray<{ value: 'start' | 'center'; label: string }> = [
  { value: 'start', label: 'Left' },
  { value: 'center', label: 'Centre' },
]

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/**
 * The inspector for a selected group: its place and size (resizing scales its widgets), whether it
 * shows all its children or one at a time, and for one at a time (a widget stack) its layers with
 * the one the wheel shows first, else the widgets in it, each of which can be taken out. Its own
 * frame round its widgets: an edge and its name as a label. Below: its name, ungroup,
 * hide and delete, all as one.
 */
export function GroupInspector({
  pageId,
  node,
  apply,
  onSelect,
  onUngroup,
  onRefused,
}: {
  pageId: string
  node: DashGroupNode
  apply: Apply
  onSelect: (ids: string[]) => void
  onUngroup: () => void
  onRefused: (message: string) => void
}) {
  const { group } = node
  const stack = group.mode === 'oneAtATime'
  const rect = nodeRect(node)
  const shown = stack ? shownChild(node) : null
  const hidden = group.hidden === true
  const frame = group.style ?? NO_GROUP_FRAME
  const setFrame = (patch: Partial<DashGroupStyle>): void => {
    const next: DashGroupStyle = { ...frame, ...patch }
    // No edge and no label is no frame: the group goes back to having none.
    apply((current) => setGroupStyle(current, pageId, node.id, next.border === 'none' && next.label === 'off' ? null : next))
  }

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

      <div className="designer-group">
        <h3 className="designer-group-title">Frame</h3>
        <div className="field">
          <span>Edge</span>
          <Segmented full label="Edge" value={frame.border} options={BORDER_OPTIONS} onChange={(border) => setFrame({ border })} />
        </div>
        <div className="field">
          <span>Name</span>
          <Segmented full label="Name" value={frame.label} options={GROUP_LABEL_OPTIONS} onChange={(label) => setFrame({ label })} />
        </div>
        {frame.label !== 'off' && (
          <div className="field">
            <span>Name at</span>
            <Segmented full label="Name at" value={frame.align ?? 'start'} options={ALIGN_OPTIONS} onChange={(align) => setFrame({ align })} />
          </div>
        )}
      </div>

      {!stack && (
        <div className="designer-group">
          <h3 className="designer-group-title">In this group</h3>
          <ul className="designer-layers">
            {node.children.map((child) => (
              <li key={child.id} className="designer-layer">
                <button type="button" className="designer-layer-main" onClick={() => onSelect([child.id])}>
                  <NodeIcon node={child} layer={false} />
                  <span className="designer-row-label">{nodeName(child)}</span>
                </button>
                <button
                  type="button"
                  className="designer-layer-make"
                  aria-label={`Take ${nodeName(child)} out of ${group.name}`}
                  onClick={() => {
                    if (!apply((current) => takeOutOfGroup(current, pageId, child.id))) onRefused("Can't take it out — it would overlap another widget.")
                  }}
                >
                  Take out
                </button>
              </li>
            ))}
          </ul>
          <p className="field-hint">Right-click a widget on the dash to move it into this group.</p>
        </div>
      )}

      {stack && (
        <div className="designer-group">
          <h3 className="designer-group-title">Layers</h3>
          <ul className="designer-layers">
            {node.children.map((child) => {
              const first = shown?.id === child.id
              return (
                <li key={child.id} className="designer-layer">
                  <button type="button" className="designer-layer-main" onClick={() => onSelect([child.id])}>
                    <NodeIcon node={child} layer />
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
        <h3 className="designer-group-title">{stack ? 'Stack' : 'Group'}</h3>
        <label className="field">
          <span>Name</span>
          <input
            key={group.name}
            className="input"
            defaultValue={group.name}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                // Cancel: put the name back so the blur that follows changes nothing.
                event.stopPropagation()
                event.currentTarget.value = group.name
                event.currentTarget.blur()
              } else blurOnEnter(event)
            }}
            onBlur={(event) => {
              const value = event.target.value
              if (!apply((current) => renameGroup(current, pageId, node.id, value))) event.target.value = group.name
            }}
          />
        </label>
        <div className="designer-button-row">
          <button type="button" className="button small" onClick={onUngroup}>
            <Ungroup /> Ungroup
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
