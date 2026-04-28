import { useState } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@sprint/ui'
import type { WidgetCatalogEntry } from '@/lib/dash'
import { MULTI_FUNCTION_WIDGET_PALETTE_TYPE } from './multiFunctionWidgetState'

const CATEGORY_ORDER = ['layout', 'timing', 'car', 'race']
interface PaletteWidget extends Pick<WidgetCatalogEntry, 'type' | 'name' | 'category' | 'categoryLabel'> {
  synthetic?: boolean
}

interface WidgetPaletteProps {
  catalog: WidgetCatalogEntry[]
  previewUrls: Record<string, string>
  includeMultiFunctionWidget?: boolean
  onDragStart?: (type: string, previewUrl?: string) => void
  onDragEnd?: () => void
}

export function WidgetPalette({
  catalog,
  previewUrls,
  includeMultiFunctionWidget = false,
  onDragStart,
  onDragEnd,
}: WidgetPaletteProps) {
  const paletteCatalog: PaletteWidget[] = includeMultiFunctionWidget
    ? [
      {
        type: MULTI_FUNCTION_WIDGET_PALETTE_TYPE,
        name: 'Multi-Function Widget',
        category: 'layout',
        categoryLabel: 'layout',
        synthetic: true,
      },
      ...catalog,
    ]
    : catalog

  const knownCategories = CATEGORY_ORDER.filter(category => paletteCatalog.some(widget => widget.category === category))
  const extraCategories = [...new Set(paletteCatalog.map(widget => widget.category))]
    .filter(category => !CATEGORY_ORDER.includes(category))
  const categories = [...knownCategories, ...extraCategories]

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (paletteCatalog.length === 0) {
    return (
      <div className="p-4 text-center font-mono text-[10px] text-text-muted">
        LOADING_CATALOG…
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {categories.map(category => {
        const isCollapsed = collapsed[category] ?? false
        const categoryLabel = paletteCatalog.find(widget => widget.category === category)?.categoryLabel ?? category

        return (
          <div key={category}>
            <button
              onClick={() => setCollapsed(previous => ({ ...previous, [category]: !isCollapsed }))}
              className="flex w-full items-center gap-1.5 px-3 pb-1 pt-3 transition-colors hover:text-foreground"
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="currentColor"
                className={cn(
                  'flex-shrink-0 text-text-disabled transition-transform duration-150',
                  isCollapsed ? '-rotate-90' : '',
                )}
              >
                <polygon points="0,0 8,0 4,8" />
              </svg>
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-text-disabled">
                {categoryLabel}
              </span>
            </button>

            {!isCollapsed && (
              <div className="px-3 pb-2">
                <WidgetList
                  widgets={paletteCatalog.filter(widget => widget.category === category)}
                  previewUrls={previewUrls}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WidgetList({
  widgets,
  previewUrls,
  onDragStart,
  onDragEnd,
}: {
  widgets: ReadonlyArray<PaletteWidget>
  previewUrls: Record<string, string>
  onDragStart?: (type: string, previewUrl?: string) => void
  onDragEnd?: () => void
}) {
  return (
    <div className="space-y-1">
      {widgets.map(widget => (
        <TooltipProvider key={widget.type}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                draggable
                onDragStart={event => {
                  event.dataTransfer.effectAllowed = 'copy'
                  event.dataTransfer.setData('widget-type', widget.type)

                  const previewUrl = previewUrls[widget.type]
                  const dragImage = document.createElement('div')
                  dragImage.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:144px;height:96px;border:1px solid rgba(255,255,255,0.2);background:#090a0c;overflow:hidden;border-radius:4px'
                  if (previewUrl) {
                    const image = document.createElement('img')
                    image.src = previewUrl
                    image.style.cssText = 'width:100%;height:100%;display:block'
                    dragImage.appendChild(image)
                  } else {
                    dragImage.style.cssText += ';display:flex;align-items:center;justify-content:center;color:#f5f7fa;font:700 11px JetBrains Mono, monospace'
                    dragImage.textContent = widget.name
                  }
                  document.body.appendChild(dragImage)
                  event.dataTransfer.setDragImage(dragImage, 12, 12)
                  requestAnimationFrame(() => dragImage.remove())

                  onDragStart?.(widget.type, previewUrl)
                }}
                onDragEnd={() => onDragEnd?.()}
                className={cn(
                  'flex w-full cursor-grab select-none items-center gap-2 border border-border px-2 py-1.5 active:cursor-grabbing',
                  'font-mono text-[10px] text-text-muted transition-colors',
                  'hover:border-border hover:text-foreground',
                  widget.synthetic ? 'border-accent/40 bg-accent/[0.04] text-foreground' : '',
                )}
              >
                <WidgetDragIcon />
                {previewUrls[widget.type] && (
                  <img
                    src={previewUrls[widget.type]}
                    alt=""
                    className="h-8 w-12 flex-shrink-0 border border-border bg-bg-shell"
                    style={{ objectFit: 'fill' }}
                  />
                )}
                <span className="truncate">{widget.name}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>Drag onto canvas to add</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  )
}

function WidgetDragIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="flex-shrink-0 text-text-disabled">
      <circle cx="3" cy="3" r="1.5" fill="currentColor" />
      <circle cx="7" cy="3" r="1.5" fill="currentColor" />
      <circle cx="3" cy="7" r="1.5" fill="currentColor" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
      <circle cx="3" cy="11" r="1.5" fill="currentColor" />
      <circle cx="7" cy="11" r="1.5" fill="currentColor" />
    </svg>
  )
}
