import { useMemo, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Input, Tile, cn } from '@sprint/ui'
import type { WidgetCatalogEntry } from '@/lib/dash'
import { WIDGET_STACK_PALETTE_TYPE } from './multiFunctionWidgetState'

const CATEGORY_ORDER = ['driving', 'timing', 'car_settings', 'race', 'info', 'layout']

interface PaletteWidget extends Pick<WidgetCatalogEntry, 'type' | 'name' | 'category' | 'categoryLabel'> {
  synthetic?: boolean
}

interface WidgetPaletteProps {
  catalog: WidgetCatalogEntry[]
  previewUrls: Record<string, string>
  includeWidgetStack?: boolean
  onDragStart?: (type: string, previewUrl?: string) => void
  onDragEnd?: () => void
}

export function WidgetPalette({
  catalog,
  previewUrls,
  includeWidgetStack = false,
  onDragStart,
  onDragEnd,
}: WidgetPaletteProps) {
  const [query, setQuery] = useState('')
  const paletteCatalog: PaletteWidget[] = includeWidgetStack
    ? [
      {
        type: WIDGET_STACK_PALETTE_TYPE,
        name: 'Widget Stack',
        category: 'layout',
        categoryLabel: 'Layout',
        synthetic: true,
      },
      ...catalog,
    ]
    : catalog

  const filteredCatalog = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return paletteCatalog
    return paletteCatalog.filter(widget =>
      widget.name.toLowerCase().includes(normalized) ||
      widget.type.toLowerCase().includes(normalized) ||
      widget.categoryLabel.toLowerCase().includes(normalized),
    )
  }, [paletteCatalog, query])

  const knownCategories = CATEGORY_ORDER.filter(category => filteredCatalog.some(widget => widget.category === category))
  const extraCategories = [...new Set(filteredCatalog.map(widget => widget.category))]
    .filter(category => !CATEGORY_ORDER.includes(category))
  const categories = [...knownCategories, ...extraCategories]

  return (
    <div className="flex flex-col gap-[14px]">
      <p className="text-[11px] text-[var(--text3)]">Drag onto the grid to place</p>

      <label className="flex flex-col gap-2">
        <span className="text-[12px] text-[var(--text3)]">Search</span>
        <div className="flex h-[36px] items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel2)] px-3 text-[var(--text3)] focus-within:border-[var(--accent)]">
          <Input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder=""
            aria-label="Search widgets"
            className="h-[32px] min-w-0 flex-1 border-0 bg-transparent px-0 focus:border-transparent"
          />
          <IconSearch size={15} aria-hidden="true" />
        </div>
      </label>

      {paletteCatalog.length === 0 ? (
        <div className="rounded-control border border-[var(--border)] bg-[var(--panel)] p-3 text-sm text-[var(--muted)]">
          Loading widget catalog...
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-control border border-[var(--border)] bg-[var(--panel)] p-3 text-sm text-[var(--muted)]">
          No widgets match this search.
        </div>
      ) : (
        <div className="space-y-[14px]">
          {categories.map(category => {
            const widgets = filteredCatalog.filter(widget => widget.category === category)
            const categoryLabel = widgets[0]?.categoryLabel ?? category

            return (
              <section key={category} className="space-y-2">
                <h4 className="font-inter text-[10px] font-bold uppercase text-[var(--muted-2)]">{categoryLabel}</h4>
                <WidgetGrid
                  widgets={widgets}
                  previewUrls={previewUrls}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WidgetGrid({
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
    <div className="grid grid-cols-2 gap-2">
      {widgets.map(widget => (
        <Tile
          key={widget.type}
          draggable
          title="Drag onto canvas to add"
          onDragStart={event => {
            event.dataTransfer.effectAllowed = 'copy'
            event.dataTransfer.setData('widget-type', widget.type)

            const previewUrl = previewUrls[widget.type]
            const dragImage = document.createElement('div')
            dragImage.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:144px;height:96px;border:1px solid #2C2C2C;background:#171717;overflow:hidden;border-radius:9px'
            if (previewUrl) {
              const image = document.createElement('img')
              image.src = previewUrl
              image.style.cssText = 'width:100%;height:100%;display:block'
              dragImage.appendChild(image)
            } else {
              dragImage.style.cssText += ';display:flex;align-items:center;justify-content:center;color:#F3F3F3;font:600 11px Inter, sans-serif'
              dragImage.textContent = widget.name
            }
            document.body.appendChild(dragImage)
            event.dataTransfer.setDragImage(dragImage, 12, 12)
            requestAnimationFrame(() => dragImage.remove())

            onDragStart?.(widget.type, previewUrl)
          }}
          onDragEnd={() => onDragEnd?.()}
          selected={widget.synthetic}
          className={cn(
            'group flex h-[54px] min-w-0 cursor-grab select-none flex-col items-start justify-center gap-1 p-3 active:cursor-grabbing',
            'text-left text-[11px] font-bold text-[var(--muted)] transition-colors',
            'hover:border-[var(--orange)] hover:text-[var(--text)]',
            widget.synthetic ? 'text-[var(--text)]' : '',
          )}
        >
          <WidgetGlyph widgetType={widget.type} />
          <span className="line-clamp-2">{widget.name}</span>
        </Tile>
      ))}
    </div>
  )
}

function WidgetGlyph({ widgetType }: { widgetType: string }) {
  const glyph = widgetType === WIDGET_STACK_PALETTE_TYPE
    ? '+'
    : widgetType.split(/[_-]/).map(part => part[0] ?? '').join('').slice(0, 2).toUpperCase()

  return (
    <span className="inline-flex size-[13px] shrink-0 items-center justify-center rounded-badge font-saira text-[10px] font-bold text-[var(--muted)] group-hover:text-[var(--orange)]">
      {glyph}
    </span>
  )
}
