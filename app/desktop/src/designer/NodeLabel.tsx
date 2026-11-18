import { Folder, Layers } from 'lucide-react'
import type { DashNode } from '@sprint/dashboard'
import { widgetName } from '../views/DashesDomain'
import { widgetIcon } from './widgetIcons'

/** What a widget or group is called in the designer: a group's name, or a widget's name (`widgetName`). */
export const nodeName = (node: DashNode): string => (node.kind === 'group' ? node.group.name : widgetName(node.widget))

/**
 * A node's icon: a stack's layers, a group's folder, or the widget type's own icon (in the
 * stack's blue when the widget is a layer of one).
 */
export function NodeIcon({ node, layer }: { node: DashNode; layer: boolean }) {
  if (node.kind === 'group') return node.group.mode === 'oneAtATime' ? <Layers size={14} className="designer-node-stack" aria-hidden="true" /> : <Folder size={14} className="designer-node-folder" aria-hidden="true" />
  const Icon = widgetIcon(node.widget.type)
  return <Icon size={14} className={layer ? 'designer-node-icon is-layer' : 'designer-node-icon'} aria-hidden="true" />
}
