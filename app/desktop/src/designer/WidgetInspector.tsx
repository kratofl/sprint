import { Eye, EyeOff, Trash2, X } from 'lucide-react'
import { hasFrame, hasLabel, widgetForms } from '@sprint/dashboard'
import type { DashLayout, DashWidget } from '@sprint/dashboard'
import { Switch } from '../shell/Switch'
import { blockedBy, configValue, holdsSmallestAt, setWidgetConfig, setWidgetLook, setWidgetSwitch, widgetDefinition, widgetFormAt, widgetName } from '../views/DashesDomain'
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
 * form that size draws), whether it wears its frame and its label (Sprint draws both, the same on
 * every dash; only those the widget has are offered), what it shows, Hide and Delete. Every field
 * edits through the same mutators the canvas uses.
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
  const framed = widget.style?.frame !== 'off'
  const labelled = widget.style?.label !== 'off'
  const labelHint = !labelled ? 'Off: the value gets its room.' : framed || !hasFrame(widget.type) ? 'Cut into the top edge.' : 'Small, above the value.'

  return (
    <aside className="designer-pane designer-inspector" aria-label={`${widgetName(widget)} properties`}>
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

      {(hasFrame(widget.type) || hasLabel(widget.type)) && (
        <div className="designer-group">
          <h3 className="designer-group-title">Frame and label</h3>
          {hasFrame(widget.type) && (
            <div className="designer-switch-row">
              <span className="designer-switch-text">
                <span id="widget-frame" className="designer-switch-title">
                  Frame
                </span>
                <span className="muted designer-switch-hint">{framed ? 'An edge round it.' : 'Off: no edge, it sits on the dash.'}</span>
              </span>
              <Switch checked={framed} onChange={(on) => apply((current) => setWidgetLook(current, pageId, widget.id, 'frame', on))} stateText={false} aria-labelledby="widget-frame" />
            </div>
          )}
          {hasLabel(widget.type) && (
            <div className="designer-switch-row">
              <span className="designer-switch-text">
                <span id="widget-label" className="designer-switch-title">
                  Label
                </span>
                <span className="muted designer-switch-hint">{labelHint}</span>
              </span>
              <Switch checked={labelled} onChange={(on) => apply((current) => setWidgetLook(current, pageId, widget.id, 'label', on))} stateText={false} aria-labelledby="widget-label" />
            </div>
          )}
        </div>
      )}

      {definition && definition.config.length > 0 && (
        <div className="designer-group">
          <h3 className="designer-group-title">Properties</h3>
          {definition.config.map((field) => {
            const value = configValue(config, field)
            if (field.kind === 'switch') {
              const id = `widget-config-${field.key}`
              const set = (on: boolean) => apply((current) => setWidgetSwitch(current, pageId, widget.id, field, on))
              // A switch that only matters while another is on waits, and says for which.
              const blocker = blockedBy(config, field, definition.config)
              return (
                <div className="designer-switch-row" key={field.key}>
                  <span className="designer-switch-text">
                    <span id={id} className="designer-switch-title">
                      {field.label}
                    </span>
                    {blocker && <span className="muted designer-switch-hint">{`Turn on ${blocker.label} first.`}</span>}
                  </span>
                  <Switch checked={value === 'on'} onChange={set} disabled={blocker !== null} stateText={false} aria-labelledby={id} />
                </div>
              )
            }
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
