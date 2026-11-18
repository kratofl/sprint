import { Copy, Eye, EyeOff, FolderInput, Group, Layers, Trash2, Ungroup } from 'lucide-react'
import type { DashGroupNode, DashNode } from '@sprint/dashboard'
import { MenuLayer, type MenuAnchor } from '../shell/Menu'

/** What the menu acts on: the selection (the right-clicked node is selected first). */
export type NodeMenuState = { anchor: MenuAnchor; nodes: readonly DashNode[] }

/**
 * The right-click menu of a widget or group on the canvas: group or stack the selection, move it
 * into one of the page's groups, ungroup, duplicate, hide and delete, with their keys. The actions
 * are the Layout section's, so the keys and the menu do the same.
 */
export function NodeMenu({
  menu,
  groups,
  onClose,
  onGroup,
  onStack,
  onMoveInto,
  onUngroup,
  onDuplicate,
  onHide,
  onDelete,
}: {
  menu: NodeMenuState
  /** The groups the selection can move into. */
  groups: readonly DashGroupNode[]
  onClose: () => void
  onGroup: () => void
  onStack: () => void
  onMoveInto: (groupId: string) => void
  onUngroup: () => void
  onDuplicate: () => void
  onHide: (hidden: boolean) => void
  onDelete: () => void
}) {
  const run = (action: () => void) => () => {
    onClose()
    action()
  }

  const anyGroup = menu.nodes.some((node) => node.kind === 'group')
  // Hide when anything shown is in the selection; show only once all of it is hidden.
  const allHidden = menu.nodes.every((node) => (node.kind === 'group' ? node.group.hidden === true : node.widget.hidden === true))
  return (
    <MenuLayer anchor={menu.anchor} label="Widget actions" width={240} onClose={onClose}>
      <button type="button" role="menuitem" className="menu-item" onClick={run(onGroup)}>
        <Group />
        <span className="menu-item-label">Create group around</span>
        <span className="menu-item-shortcut">Ctrl+G</span>
      </button>
      <button type="button" role="menuitem" className="menu-item" onClick={run(onStack)}>
        <Layers />
        <span className="menu-item-label">Create stack around</span>
      </button>
      {groups.map((group) => (
        <button key={group.id} type="button" role="menuitem" className="menu-item" onClick={run(() => onMoveInto(group.id))}>
          <FolderInput />
          <span className="menu-item-label">Move into {group.group.name}</span>
        </button>
      ))}
      {anyGroup && (
        <button type="button" role="menuitem" className="menu-item" onClick={run(onUngroup)}>
          <Ungroup />
          <span className="menu-item-label">Ungroup</span>
          <span className="menu-item-shortcut">Ctrl+Shift+G</span>
        </button>
      )}
      <div className="menu-separator" role="separator" />
      <button type="button" role="menuitem" className="menu-item" onClick={run(onDuplicate)}>
        <Copy />
        <span className="menu-item-label">Duplicate</span>
        <span className="menu-item-shortcut">Ctrl+D</span>
      </button>
      <button type="button" role="menuitem" className="menu-item" onClick={run(() => onHide(!allHidden))}>
        {allHidden ? <Eye /> : <EyeOff />}
        <span className="menu-item-label">{allHidden ? 'Show on the wheel' : 'Hide on the wheel'}</span>
      </button>
      <div className="menu-separator" role="separator" />
      <button type="button" role="menuitem" className="menu-item destructive" onClick={run(onDelete)}>
        <Trash2 />
        <span className="menu-item-label">Delete</span>
        <span className="menu-item-shortcut">Del</span>
      </button>
    </MenuLayer>
  )
}
