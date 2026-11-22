import { useState } from 'react'
import { Check } from 'lucide-react'
import { DashCanvas, DEFAULT_DASH_CHROME, dashPreviewStates, dashThemePresets, matchLayoutThemeName, resolveDashPalette, resolvePreviewFrame } from '@sprint/dashboard'
import type { DashColorSystem, DashLayout, DashPage, DashPreviewState } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { applyThemePreset, setDashChrome } from '../views/DashesDomain'
import { BORDER_OPTIONS, LABEL_OPTIONS, Segmented, SelectField } from './controls'
import { BEZEL, useStageCanvas } from './useStageCanvas'
import type { Mutate } from './useDesignerDoc'
import './ThemeSection.css'

type Apply = (mutate: Mutate, group?: string) => boolean

const CORNER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '0', label: 'Square' },
  { value: '3', label: 'Soft' },
  { value: '6', label: 'Round' },
  { value: '10', label: 'Rounder' },
]

// Each preset's two dots: its focal and its comparison colour, as the dash resolves them.
const PRESETS = dashThemePresets.map((preset) => {
  const colorSystem: DashColorSystem = preset.name === 'Graphite' ? 'functional' : 'styled'
  const palette = resolveDashPalette(preset.theme, colorSystem)
  return { preset, colorSystem, dots: [palette.primary, palette.accent] }
})

/**
 * Theme: the dash's one look (its corners, edges and where labels sit) and the colour presets on
 * the left, the live dash in the middle, and on the right what the dash shows meanwhile — live
 * or a sample situation — so each colour can be checked in each one. A click applies; undo
 * takes it back.
 */
export function ThemeSection({
  layout,
  apply,
  frame,
  page,
  idle,
}: {
  layout: DashLayout
  apply: Apply
  frame: TelemetryFrame | null
  page: DashPage | null
  idle: boolean
}) {
  const [previewState, setPreviewState] = useState<DashPreviewState>('live')
  const { setFitElement, canvas } = useStageCanvas(layout)
  const chrome = layout.chrome ?? DEFAULT_DASH_CHROME
  const activePreset = matchLayoutThemeName(layout)

  return (
    <>
      <aside className="designer-glass designer-sidebar" aria-label="Theme">
        <div className="designer-sidebar-head">
          <h2 className="designer-panel-title">Theme</h2>
        </div>
        <div className="designer-sidebar-body theme-body">
          <div className="designer-group">
              <h3 className="designer-group-title">Frames</h3>
              <div className="field">
                <span>Corners</span>
                <Segmented full label="Corners" value={String(chrome.radius)} options={CORNER_OPTIONS} onChange={(radius) => apply((current) => setDashChrome(current, { radius: Number(radius) }))} />
              </div>
              <div className="field">
                <span>Edges</span>
                <Segmented full label="Edges" value={chrome.border} options={BORDER_OPTIONS} onChange={(border) => apply((current) => setDashChrome(current, { border }))} />
              </div>
              <SelectField label="Labels" value={chrome.label} options={LABEL_OPTIONS} onChange={(label) => apply((current) => setDashChrome(current, { label }))} />
              <p className="field-hint">For every widget. A widget can only move its own label; a group can wear its own frame.</p>
            </div>

          <div className="designer-group">
            <h3 className="designer-group-title">Colours</h3>
            <div className="theme-presets" role="radiogroup" aria-label="Colours">
              {PRESETS.map(({ preset, colorSystem, dots }) => {
                const selected = preset.name === activePreset
                return (
                  <button
                    key={preset.name}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className="theme-preset"
                    onClick={() => apply((current) => (selected ? null : applyThemePreset(current, preset.theme, colorSystem)))}
                  >
                    <span className="theme-dots" aria-hidden="true">
                      {dots.map((color, index) => (
                        <span key={index} className="theme-dot" style={{ background: color }} />
                      ))}
                    </span>
                    <span className="designer-row-label">{preset.name}</span>
                    {selected && <Check size={14} className="theme-check" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <p className="field-hint designer-sidebar-foot">Colours follow what they mean: each knob its own, purple best, amber when fuel runs low.</p>
      </aside>

      <div ref={setFitElement} className="designer-fit">
        {canvas && (
          <div className="designer-bezel" style={{ padding: BEZEL }}>
            <DashCanvas layout={layout} frame={resolvePreviewFrame(previewState, frame)} width={canvas.width} height={canvas.height} pageId={page?.id} idle={idle} />
          </div>
        )}
      </div>

      <aside className="designer-glass designer-inspector" aria-label="Look at it as">
        <div className="designer-panel-intro">
          <h2 className="designer-panel-title">Look at it as</h2>
          <p className="field-hint">The dash shows sample values for each</p>
        </div>
        <div className="theme-chips" role="radiogroup" aria-label="Look at it as">
          {dashPreviewStates.map((option) => (
            <button key={option.state} type="button" role="radio" aria-checked={option.state === previewState} className="filter-chip" onClick={() => setPreviewState(option.state)}>
              {option.state === 'live' ? 'Live' : option.label}
            </button>
          ))}
        </div>
      </aside>
    </>
  )
}
