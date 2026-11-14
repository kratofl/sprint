import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Eye, EyeOff, Trash2, X } from 'lucide-react'
import { resolveDashPalette, resolveStyleColor } from '@sprint/dashboard'
import type { DashLayout, DashWidget } from '@sprint/dashboard'
import { WIDGET_STYLE_COLOR_TOKENS, setWidgetConfig, setWidgetStyle, widgetDefinition, widgetDisplayName } from '../views/DashesDomain'
import { GeometryFields, TextConfigField } from './controls'
import { deleteNodes, setHidden, setNodeRect } from './groupOps'
import type { Mutate } from './useDesignerDoc'

type Apply = (mutate: Mutate, group?: string) => boolean

/**
 * The floating inspector beside the dash for the selected widget: its position and size, its
 * properties, its value and label colours, Hide and Delete. Every field edits through the same
 * mutators the canvas uses.
 */
export function WidgetInspector({
  layout,
  pageId,
  widget,
  apply,
  onDeselect,
}: {
  layout: DashLayout
  pageId: string
  widget: DashWidget
  apply: Apply
  onDeselect: () => void
}) {
  const definition = widgetDefinition(widget.type)
  const config = widget.config ?? {}
  const palette = resolveDashPalette(layout.theme, layout.colorSystem)

  return (
    <aside className="designer-glass designer-inspector" aria-label={`${widgetDisplayName(widget.type)} properties`}>
      <div className="designer-panel-head">
        <h2 className="designer-panel-title">{widgetDisplayName(widget.type)}</h2>
        <button type="button" className="icon-button" aria-label="Deselect widget" title="Deselect (Esc)" onClick={onDeselect}>
          <X size={14} />
        </button>
      </div>

      <div className="designer-group">
        <h3 className="designer-group-title">Position &amp; size</h3>
        <GeometryFields rect={widget} onChange={(rect, field) => apply((current) => setNodeRect(current, pageId, widget.id, rect), `geometry:${widget.id}:${field}`)} />
      </div>

      {definition && definition.config.length > 0 && (
        <div className="designer-group">
          <h3 className="designer-group-title">Properties</h3>
          {definition.config.map((field) => {
            const raw = config[field.key]
            const value = typeof raw === 'string' ? raw : field.default
            if (field.kind === 'select') {
              return (
                <label className="field" key={field.key}>
                  <span>{field.label}</span>
                  <select value={value} onChange={(event) => apply((current) => setWidgetConfig(current, pageId, widget.id, field.key, event.target.value))}>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )
            }
            return <TextConfigField key={field.key} label={field.label} value={value} onCommit={(next) => apply((current) => (next === value ? null : setWidgetConfig(current, pageId, widget.id, field.key, next)))} />
          })}
        </div>
      )}

      <div className="designer-group">
        <h3 className="designer-group-title">Colours</h3>
        <ColourSwatches label="Value" value={widget.style?.textColor} colorOf={(token) => resolveStyleColor(token, palette)} onChange={(textColor) => apply((current) => setWidgetStyle(current, pageId, widget.id, { textColor }))} />
        <ColourSwatches label="Label" value={widget.style?.labelColor} colorOf={(token) => resolveStyleColor(token, palette)} onChange={(labelColor) => apply((current) => setWidgetStyle(current, pageId, widget.id, { labelColor }))} />
      </div>

      <div className="designer-button-row designer-inspector-delete">
        <button type="button" className="button subtle" onClick={() => apply((current) => setHidden(current, pageId, [widget.id], widget.hidden !== true))}>
          {widget.hidden ? <Eye /> : <EyeOff />} {widget.hidden ? 'Show on the wheel' : 'Hide on the wheel'}
        </button>
        <button
          type="button"
          className="button subtle destructive"
          onClick={() => {
            apply((current) => deleteNodes(current, pageId, [widget.id]))
            onDeselect()
          }}
        >
          <Trash2 /> Delete widget
        </button>
      </div>
    </aside>
  )
}

/**
 * One colour choice as a row of swatches: "Inherit" (the dash's own colour, drawn struck
 * through) and every widget style colour, in the dash's palette. A radio group: arrow keys move
 * the choice.
 */
function ColourSwatches({
  label,
  value,
  colorOf,
  onChange,
}: {
  label: string
  value: string | undefined
  colorOf: (token: string) => string | undefined
  onChange: (token: string | undefined) => void
}) {
  const options: { token: string | undefined; name: string }[] = [{ token: undefined, name: 'Inherit' }, ...WIDGET_STYLE_COLOR_TOKENS.map((token) => ({ token: token.value, name: token.label }))]
  const current = options.findIndex((option) => option.token === (value || undefined))
  const selectedIndex = current < 0 ? 0 : current

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = options[(selectedIndex + step + options.length) % options.length]
    onChange(next.token)
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button')
    buttons[(selectedIndex + step + options.length) % options.length]?.focus()
  }

  return (
    <div className="designer-swatch-row">
      <span className="designer-swatch-label">{label}</span>
      <div className="designer-swatches" role="radiogroup" aria-label={`${label} colour`} onKeyDown={onKeyDown}>
        {options.map((option, index) => {
          const checked = index === selectedIndex
          const color = option.token ? colorOf(option.token) : undefined
          return (
            <button
              key={option.name}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.name}
              title={option.name}
              tabIndex={checked ? 0 : -1}
              className={option.token ? 'designer-swatch' : 'designer-swatch inherit'}
              style={color ? { background: color } : undefined}
              onClick={() => onChange(option.token)}
            />
          )
        })}
      </div>
    </div>
  )
}
