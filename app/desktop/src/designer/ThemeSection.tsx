import { useState } from 'react'
import { Check } from 'lucide-react'
import { DashCanvas, dashPreviewStates, dashStyles, dashThemePresets, matchLayoutThemeName, resolveDashPalette, resolvePreviewFrame } from '@sprint/dashboard'
import type { DashColorSystem, DashLayout, DashPage, DashPreviewState, DashStyle } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { applyThemePreset, setDashStyle } from '../views/DashesDomain'
import { DashStill } from '../views/DashStill'
import { BEZEL, useStageCanvas } from './useStageCanvas'
import type { Mutate } from './useDesignerDoc'
import './ThemeSection.css'

type Apply = (mutate: Mutate, group?: string) => boolean

const DASH_STYLE_LABELS: Record<DashStyle, string> = { panels: 'Panels', grid: 'Grid', bars: 'Label bars' }

// Each preset's two dots: its focal and its comparison colour, as the dash resolves them.
const PRESETS = dashThemePresets.map((preset) => {
  const colorSystem: DashColorSystem = preset.name === 'Graphite' ? 'functional' : 'styled'
  const palette = resolveDashPalette(preset.theme, colorSystem)
  return { preset, colorSystem, dots: [palette.primary, palette.accent] }
})

/**
 * Theme: how widgets are framed (the dash style, as small pictures) and the colour presets on
 * the left, the live dash in the middle, and on the right what the dash shows meanwhile — live
 * or a sample situation — so each colour can be checked in each one. A click applies; undo
 * takes it back.
 */
export function ThemeSection({ layout, apply, frame, page, idle }: { layout: DashLayout; apply: Apply; frame: TelemetryFrame | null; page: DashPage | null; idle: boolean }) {
  const [previewState, setPreviewState] = useState<DashPreviewState>('live')
  const { setFitElement, canvas } = useStageCanvas(layout)
  const activeStyle = layout.dashStyle ?? 'panels'
  const activePreset = matchLayoutThemeName(layout)

  return (
    <>
      <aside className="designer-glass designer-sidebar" aria-label="Theme">
        <div className="designer-sidebar-head">
          <h2 className="designer-panel-title">Theme</h2>
        </div>
        <div className="designer-sidebar-body theme-body">
          <div className="designer-group">
            <h3 className="designer-group-title">Style</h3>
            <div className="theme-styles" role="radiogroup" aria-label="Style">
              {dashStyles.map((dashStyle) => (
                <button
                  key={dashStyle}
                  type="button"
                  role="radio"
                  aria-checked={dashStyle === activeStyle}
                  className="theme-style"
                  onClick={() => apply((current) => setDashStyle(current, dashStyle))}
                >
                  <span className="theme-style-well">
                    <DashStill layout={{ ...layout, dashStyle }} maxWidth={100} maxHeight={60} />
                  </span>
                  <span className="theme-style-name">{DASH_STYLE_LABELS[dashStyle]}</span>
                </button>
              ))}
            </div>
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
        <p className="field-hint designer-sidebar-foot">Graphite keeps the racing colours: green faster, purple best.</p>
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
