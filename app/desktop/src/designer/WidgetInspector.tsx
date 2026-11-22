import { Eye, EyeOff, Trash2, X } from 'lucide-react'
import { widgetForms } from '@sprint/dashboard'
import type { DashLayout, DashWidget } from '@sprint/dashboard'
import { holdsSmallestAt, setWidgetConfig, widgetDefinition, widgetFormAt, widgetName } from '../views/DashesDomain'
import { GeometryFields, TextConfigField } from './controls'
import { deleteNodes, setHidden, setNodeRect } from './groupOps'
import type { Mutate } from './useDesignerDoc'

type Apply = (mutate: Mutate, group?: string) => boolean

/** "Large, then Compact (no brake temperature), then Small (…)": a widget's forms, for its Size hint. */
function formsHint(type: string): string | null {
  const forms = widgetForms(type)
  if (forms.length < 2) return null
  const names = forms.map((form) => (form.hides ? `${form.name} (no ${form.hides})` : form.name))
  return `Smaller boxes show less: ${names.join(', then ')}. It never gets smaller.`
}

/**
 * The floating inspector beside the dash for the selected widget: its position and size (and the
 * form that size draws), what it shows, Hide and Delete. Its label spot is on the canvas
 * (`LabelBar`); its frame and colours are the dash's (Theme). Every field edits through the same
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
  const { form, several } = widgetFormAt(layout, widget.type, widget)
  const hint = formsHint(widget.type)
  // A side shrinks only while the widget still holds its smallest form.
  const minColSpan = widget.colSpan > 1 && holdsSmallestAt(layout, widget.type, { ...widget, colSpan: widget.colSpan - 1 }) ? 1 : widget.colSpan
  const minRowSpan = widget.rowSpan > 1 && holdsSmallestAt(layout, widget.type, { ...widget, rowSpan: widget.rowSpan - 1 }) ? 1 : widget.rowSpan

  return (
    <aside className="designer-glass designer-inspector" aria-label={`${widgetName(widget)} properties`}>
      <div className="designer-panel-head">
        <h2 className="designer-panel-title">{widgetName(widget)}</h2>
        <button type="button" className="icon-button" aria-label="Deselect widget" title="Deselect (Esc)" onClick={onDeselect}>
          <X size={14} />
        </button>
      </div>

      <div className="designer-group">
        <h3 className="designer-group-title">Position &amp; size</h3>
        {several && form.name && <p className="designer-form-now">{form.name}</p>}
        <GeometryFields
          rect={widget}
          minColSpan={minColSpan}
          minRowSpan={minRowSpan}
          onChange={(rect, field) => apply((current) => setNodeRect(current, pageId, widget.id, rect), `geometry:${widget.id}:${field}`)}
        />
        {hint && <p className="field-hint">{hint}</p>}
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
