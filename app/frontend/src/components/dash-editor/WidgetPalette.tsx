import { useMemo, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Input, cn } from '@sprint/ui'
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
      <p className="text-[10px] text-[var(--text3)]">Drag onto the grid to place</p>

      {/* Figma "Input w Label": Search field, radius 18, trailing search icon. */}
      <label className="flex flex-col gap-[6px]">
        <span className="text-[11px] text-[var(--text2)]">Search</span>
        <div className="flex h-[32px] items-center gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--panel2)] px-[10px] text-[var(--text3)] focus-within:border-[var(--accent)]">
          <Input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search widgets"
            aria-label="Search widgets"
            className="h-[28px] min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] focus:border-transparent focus-visible:border-transparent"
          />
          <IconSearch size={15} aria-hidden="true" />
        </div>
      </label>

      {paletteCatalog.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--panel2)] p-3 text-[12px] text-[var(--text2)]">
          Loading widget catalog...
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--panel2)] p-3 text-[12px] text-[var(--text2)]">
          No widgets match this search.
        </div>
      ) : (
        <div className="flex flex-col gap-[14px]">
          {categories.map(category => {
            const widgets = filteredCatalog.filter(widget => widget.category === category)
            const categoryLabel = widgets[0]?.categoryLabel ?? category

            return (
              <section key={category} className="flex flex-col gap-[6px]">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text3)]">{categoryLabel}</h4>
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
    <div className="grid grid-cols-2 gap-[6px]">
      {widgets.map(widget => (
        <div
          key={widget.type}
          role="button"
          tabIndex={0}
          draggable
          title="Drag onto canvas to add"
          onDragStart={event => {
            event.dataTransfer.effectAllowed = 'copy'
            event.dataTransfer.setData('widget-type', widget.type)

            const previewUrl = previewUrls[widget.type]
            const dragImage = document.createElement('div')
            dragImage.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:144px;height:96px;border:1px solid var(--line);background:var(--panel2);overflow:hidden;border-radius:12px'
            if (previewUrl) {
              const image = document.createElement('img')
              image.src = previewUrl
              image.style.cssText = 'width:100%;height:100%;display:block'
              dragImage.appendChild(image)
            } else {
              dragImage.style.cssText += ';display:flex;align-items:center;justify-content:center;color:var(--text);font:600 11px Inter, sans-serif'
              dragImage.textContent = widget.name
            }
            document.body.appendChild(dragImage)
            event.dataTransfer.setDragImage(dragImage, 12, 12)
            requestAnimationFrame(() => dragImage.remove())

            onDragStart?.(widget.type, previewUrl)
          }}
          onDragEnd={() => onDragEnd?.()}
          className={cn(
            // Figma "Widget" tile: 107×46, Surface/Tile, radius 12, pad 8, gap 6.
            // min-h (not fixed h) so longer labels wrap to a second line instead
            // of being clipped.
            'group flex min-h-[46px] min-w-0 cursor-grab select-none flex-col items-start justify-center gap-[6px] rounded-[12px] border bg-[var(--panel2)] p-[8px] text-left transition-colors active:cursor-grabbing',
            'hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]',
            widget.synthetic ? 'border-[var(--accent)]' : 'border-[var(--line)]',
          )}
        >
          <WidgetGlyph widgetType={widget.type} synthetic={widget.synthetic} />
          <span className={cn(
            'line-clamp-2 text-[11px] font-semibold leading-[1.15] text-[var(--text2)] transition-colors group-hover:text-[var(--text)]',
            widget.synthetic && 'text-[var(--text)]',
          )}>
            {widget.name}
          </span>
        </div>
      ))}
    </div>
  )
}

function WidgetGlyph({ widgetType, synthetic }: { widgetType: string; synthetic?: boolean }) {
  const glyph = widgetType === WIDGET_STACK_PALETTE_TYPE
    ? '+'
    : widgetType.split(/[_-]/).map(part => part[0] ?? '').join('').slice(0, 2).toUpperCase()

  return (
    <span className={cn(
      'inline-flex h-[13px] min-w-[13px] shrink-0 items-center justify-center font-saira text-[10px] font-bold leading-none transition-colors',
      synthetic ? 'text-[var(--accent)]' : 'text-[var(--text3)] group-hover:text-[var(--accent)]',
    )}>
      {glyph}
    </span>
  )
}
