import { useEffect, useState, type KeyboardEvent } from 'react'
import { ChevronLeft } from 'lucide-react'
import { DashCanvas, multiDialInk, multiDialSwatches, type DashLayout } from '@sprint/dashboard'
import type { MultiDial, MultiDialLabel, SprintCommand } from '../bridge'
import { blurOnEnter, Switch } from './SettingsLayout'
import {
  CONTROL_ZOOM,
  RING_EXTENT,
  RING_STROKE,
  isHexColor,
  ringSegments,
  ringWidthFraction,
  selectionArrow,
  zoomTransform,
} from './DeviceControlsDomain'
import { deviceImageSrc } from './DeviceImage'
import type { DeviceImageKey } from './DevicesDomain'

/** The longest name a position takes (`MultiDials.MaxLabelLength` on the host). */
const MAX_LABEL_LENGTH = 8

/**
 * A wheel's Controls tab: its picture with the controls Sprint knows outlined on it. Clicking
 * one zooms in on it (Escape or "Whole wheel" zooms back out); the panel beside the picture
 * lists the controls, or edits the one zoomed on. Today that is the multi-dial: its positions
 * appear as coloured boxes round the dial, and turning the dial on the wheel selects the
 * position it lands on.
 */
export function DeviceControls({
  dial,
  image,
  screenSize,
  send,
}: {
  dial: MultiDial
  image: DeviceImageKey | null
  /** The wheel screen's logical size, so the popup preview has its shape. */
  screenSize: { width: number; height: number }
  send: (command: SprintCommand) => Promise<void>
}) {
  const [zoomed, setZoomed] = useState(false)
  const [selected, setSelected] = useState(dial.position ?? 0)

  // Turning the dial picks the position to edit, so the box under the edit is the one the
  // driver is holding the wheel on.
  useEffect(() => {
    if (dial.position !== null) setSelected(dial.position)
  }, [dial.position, dial.changes])

  const zoomOut = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && zoomed) setZoomed(false)
  }

  return (
    <div className="card controls-card" onKeyDown={zoomOut}>
      <ControlsStage dial={dial} image={image} zoomed={zoomed} selected={selected} onZoom={setZoomed} onSelect={setSelected} />
      <div className="controls-panel">
        {zoomed ? (
          <DialEditor key={selected} dial={dial} index={selected} screenSize={screenSize} send={send} />
        ) : (
          <ControlsList dial={dial} onOpen={() => setZoomed(true)} />
        )}
      </div>
    </div>
  )
}

/** The device picture, zoomed on the dial or whole, with the control outlines and the label boxes. */
function ControlsStage({
  dial,
  image,
  zoomed,
  selected,
  onZoom,
  onSelect,
}: {
  dial: MultiDial
  image: DeviceImageKey | null
  zoomed: boolean
  selected: number
  onZoom: (zoomed: boolean) => void
  onSelect: (index: number) => void
}) {
  const src = image ? deviceImageSrc(image) : null
  return (
    <div className={zoomed ? 'controls-stage zoomed' : 'controls-stage'}>
      {/* Before the ring in the DOM so Tab reaches it first; it sits over the picture's corner. */}
      {zoomed && (
        <button type="button" className="button controls-back" onClick={() => onZoom(false)}>
          <ChevronLeft /> Whole wheel
        </button>
      )}
      <div className="controls-frame">
        <div className="controls-zoom" style={{ transform: zoomed ? zoomTransform(dial.x, dial.y, CONTROL_ZOOM) : 'none' }}>
          {src && <img src={src} alt="" draggable={false} />}
          {!zoomed && (
            <button
              type="button"
              className="controls-hotspot"
              aria-label={`${dial.label} dial, ${dial.positions.length} positions`}
              title={`${dial.label} dial · ${dial.positions.length} positions`}
              style={{ left: `${dial.x * 100}%`, top: `${dial.y * 100}%`, width: `${dial.radius * 200}%` }}
              onClick={() => onZoom(true)}
            />
          )}
        </div>
        {zoomed && <DialRing dial={dial} selected={selected} onSelect={onSelect} />}
      </div>
    </div>
  )
}

/** The dial's positions as coloured, named boxes round the zoomed dial; the selected one ringed and pointed at. */
function DialRing({ dial, selected, onSelect }: { dial: MultiDial; selected: number; onSelect: (index: number) => void }) {
  const segments = ringSegments(dial.positions.length)
  const selectedSegment = segments[selected]
  // One tab stop for the whole ring; the arrow keys walk round it, as in any radio group.
  const step = (event: KeyboardEvent<SVGGElement>) => {
    const move = RING_KEYS[event.key]
    if (move === undefined) return
    event.preventDefault()
    const next = (selected + move + segments.length) % segments.length
    onSelect(next)
    event.currentTarget.parentElement?.querySelector<SVGGElement>(`[data-index="${next}"]`)?.focus()
  }

  return (
    <svg
      className="controls-ring"
      viewBox={`${-RING_EXTENT} ${-RING_EXTENT} ${RING_EXTENT * 2} ${RING_EXTENT * 2}`}
      style={{ width: `${ringWidthFraction(dial.radius, CONTROL_ZOOM) * 100}%` }}
      role="radiogroup"
      aria-label={`${dial.label} positions`}
    >
      {segments.map((segment) => {
        const position = dial.positions[segment.index]
        if (!position) return null
        const isSelected = segment.index === selected
        return (
          <g
            key={segment.index}
            className="controls-ring-box"
            role="radio"
            aria-checked={isSelected}
            aria-label={`Position ${segment.index + 1}: ${position.label}`}
            data-index={segment.index}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(segment.index)}
            onKeyDown={step}
          >
            {isSelected && (
              <>
                {/* Keyboard focus, as the app's focus ring: 2px, 2px outside the selection ring. */}
                <path d={segment.path} className="controls-ring-focus" strokeWidth={RING_STROKE + 20} />
                <path d={segment.path} className="controls-ring-focus-gap" strokeWidth={RING_STROKE + 16} />
                <path d={segment.path} className="controls-ring-selected" strokeWidth={RING_STROKE + 12} />
                <path d={segment.path} className="controls-ring-gap" strokeWidth={RING_STROKE + 5} />
              </>
            )}
            <path d={segment.path} className="controls-ring-edge" strokeWidth={RING_STROKE + 2} />
            <path d={segment.path} stroke={position.color} strokeWidth={RING_STROKE} fill="none" strokeLinecap="round" />
            <text
              x={segment.textX}
              y={segment.textY}
              transform={`rotate(${segment.textRotation} ${segment.textX} ${segment.textY})`}
              fill={multiDialInk(position.color)}
              className="controls-ring-name"
            >
              {position.label}
            </text>
          </g>
        )
      })}
      {selectedSegment && <path d={selectionArrow(selectedSegment.angle)} className="controls-ring-arrow" />}
    </svg>
  )
}

/** Not zoomed: what can be set up on this wheel, the keyboard's way to the same controls. */
function ControlsList({ dial, onOpen }: { dial: MultiDial; onOpen: () => void }) {
  const current = dial.position !== null ? dial.positions[dial.position] : undefined
  return (
    <>
      <div className="controls-panel-head">
        <h3>Controls</h3>
        <span className="muted">Click a control on the wheel, or pick it here.</span>
      </div>
      <div className="controls-group">
        <span className="controls-group-title">Dials</span>
        <button type="button" className="controls-item" onClick={onOpen}>
          <span>{dial.label}</span>
          <span className="muted">
            {dial.positions.length} positions{current ? ` · on ${current.label}` : ''}
          </span>
        </button>
      </div>
    </>
  )
}

/** Name, colour and popup of one dial position, with the device-wide invert switch. */
function DialEditor({
  dial,
  index,
  screenSize,
  send,
}: {
  dial: MultiDial
  index: number
  screenSize: { width: number; height: number }
  send: (command: SprintCommand) => Promise<void>
}) {
  const position = dial.positions[index]
  const [name, setName] = useState(position?.label ?? '')
  const [hex, setHex] = useState(position?.color ?? '')
  if (!position) return null

  const save = (next: MultiDialLabel) => {
    if (next.label === position.label && next.color.toUpperCase() === position.color.toUpperCase()) return
    void send({ type: 'devices.multiDial', deviceId: dial.deviceId, position: index, label: next.label, color: next.color })
  }
  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed.length === 0) setName(position.label)
    else save({ label: trimmed, color: position.color })
  }
  const commitHex = () => {
    const value = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`
    if (isHexColor(value)) save({ label: position.label, color: value.toUpperCase() })
    else setHex(position.color)
  }
  const pickSwatch = (color: string) => {
    setHex(color)
    save({ label: position.label, color })
  }

  const preview = screenSize.width > 0 && screenSize.height > 0 ? screenSize : { width: 800, height: 480 }
  const previewScale = PREVIEW_WIDTH / preview.width
  return (
    <>
      <div className="controls-panel-head">
        <span className="muted">
          {dial.label} dial · position {index + 1} of {dial.positions.length}
          {dial.position === index ? ' · the dial is here' : ''}
        </span>
        <h3>{position.label}</h3>
      </div>

      <label className="controls-field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          maxLength={MAX_LABEL_LENGTH}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
        />
      </label>

      <div className="controls-field">
        <span id="controls-color-title">Colour on the dash</span>
        <div className="controls-swatches" role="radiogroup" aria-labelledby="controls-color-title">
          {multiDialSwatches.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={color.toUpperCase() === position.color.toUpperCase()}
              aria-label={color}
              className="controls-swatch"
              style={{ background: color }}
              onClick={() => pickSwatch(color)}
            />
          ))}
        </div>
        <span className="controls-hex">
          <span className="controls-swatch" style={{ background: position.color }} aria-hidden="true" />
          <input
            type="text"
            className="tabular"
            aria-label="Colour as hex"
            value={hex}
            maxLength={7}
            onChange={(event) => setHex(event.target.value)}
            onBlur={commitHex}
            onKeyDown={blurOnEnter}
          />
        </span>
      </div>

      <div className="controls-field">
        <span>Popup on the wheel</span>
        <div className="controls-preview" aria-hidden="true">
          <DashCanvas
            layout={PREVIEW_LAYOUT}
            width={PREVIEW_WIDTH}
            height={Math.round(preview.height * previewScale)}
            alertBanner={{ kind: 'multiDial', caption: dial.label, label: position.label, color: position.color, inverted: dial.invertPopup }}
          />
        </div>
      </div>

      <div className="controls-invert">
        <span className="controls-invert-text">
          <span id="controls-invert-title">Invert colours</span>
          <span className="muted" id="controls-invert-description">
            For every position
          </span>
        </span>
        <Switch
          checked={dial.invertPopup}
          onChange={(invertPopup) => void send({ type: 'devices.multiDial', deviceId: dial.deviceId, invertPopup })}
          aria-labelledby="controls-invert-title"
          aria-describedby="controls-invert-description"
        />
      </div>
    </>
  )
}

/** Arrow keys round the dial: right and down go clockwise. */
const RING_KEYS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** The popup preview's width in the panel, in CSS pixels. */
const PREVIEW_WIDTH = 320

/**
 * What the preview draws the popup over. The popup covers the whole dash, so the page never
 * shows; the layout only gives the popup its background, the default palette's.
 */
const PREVIEW_LAYOUT: DashLayout = {
  id: 'multi-dial-preview',
  name: 'Multi-dial preview',
  mode: 'race',
  gridCols: 20,
  gridRows: 12,
  pages: [{ id: 'page', name: 'Page', widgets: [] }],
  alerts: [],
}
