import { useState } from 'react'
import type { PitWallTrace, TraceLap } from '../pitWallData'
import { channelLevels, speedTop, TRACE_CHANNELS } from '../carDomain'
import { lapClock, playerOf } from '../timing'
import { TileFrame, type FrameProps, type TileData } from '../tileFrame'
import { useSize } from '../useSize'
import { useTraces } from '../useTraces'

type Compare = 'none' | Exclude<TraceLap, 'current'>

const COMPARE: readonly { value: Compare; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'target', label: 'Target lap' },
  { value: 'best', label: 'Best lap' },
  { value: 'last', label: 'Last lap' },
]

const ROW_PAD = 8

/** One channel's line in its row, as SVG points. */
const linePoints = (trace: PitWallTrace, levels: readonly number[], width: number, top: number, height: number): string =>
  levels.map((level, index) => `${(trace.distance[index] * width).toFixed(1)},${(top + ROW_PAD + (1 - level) * (height - ROW_PAD * 2)).toFixed(1)}`).join(' ')

/**
 * The lap being driven, channel by channel in Analysis's colours against distance round the lap;
 * optionally another lap dashed in grey under it. A line marks where the car is now. Asks for the
 * laps once a second while it is on screen.
 */
export function TracesTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const [compare, setCompare] = useState<Compare>('none')
  const wall = data.pitWall
  const traces = useTraces(compare === 'none' ? ['current'] : ['current', compare], wall !== null)
  const [ref, size] = useSize<HTMLDivElement>()
  const current = traces.current ?? null
  const other = compare === 'none' ? null : (traces[compare] ?? null)
  const player = wall ? playerOf(wall.field) : null
  // The game counts laps from 0; the wall says "lap 1" for the first, as the timing summary does.
  const lap = current && current.lap !== null ? current.lap + 1 : player ? player.lapsCompleted + 1 : null
  const segmented = (
    <span className="segmented pw-seg" role="radiogroup" aria-label="Compare with">
      {COMPARE.map((option) => (
        <button key={option.value} type="button" role="radio" className="segmented-item" aria-checked={compare === option.value} onClick={() => setCompare(option.value)}>
          {option.label}
        </button>
      ))}
    </span>
  )
  const top = speedTop(...[current, other].filter((trace): trace is PitWallTrace => trace !== null))
  const rowHeight = size.height / TRACE_CHANNELS.length
  const carAt = current && current.distance.length > 0 ? current.distance[current.distance.length - 1] : (player?.lapFraction ?? null)
  const compareLabel = COMPARE.find((option) => option.value === compare)?.label ?? ''
  return (
    <TileFrame frame={frame} title={lap !== null ? `Telemetry · lap ${lap}` : 'Telemetry'} extra={segmented} bodyClass="pw-chart-body">
      {!wall ? (
        null
      ) : (
        <>
          <div className="pw-chart" ref={ref}>
            {size.width > 0 && size.height > 0 && (
              <svg width={size.width} height={size.height} role="img" aria-label={`Speed, throttle, brake and steering${other ? `, against the ${compareLabel.toLowerCase()}` : ''}`}>
                {TRACE_CHANNELS.map(({ channel, label }, row) => (
                  <g key={channel}>
                    <text x={6} y={row * rowHeight + 16} className="pw-trace-label">
                      {label}
                    </text>
                    {row > 0 && <line x1={0} x2={size.width} y1={row * rowHeight} y2={row * rowHeight} className="pw-trace-rule" />}
                    {other && other.distance.length > 1 && (
                      <polyline points={linePoints(other, channelLevels(other, channel, top), size.width, row * rowHeight, rowHeight)} className="pw-trace other" />
                    )}
                    {current && current.distance.length > 1 && (
                      <polyline points={linePoints(current, channelLevels(current, channel, top), size.width, row * rowHeight, rowHeight)} className={`pw-trace ${channel}`} />
                    )}
                  </g>
                ))}
                {carAt !== null && <line x1={carAt * size.width} x2={carAt * size.width} y1={0} y2={size.height} className="pw-trace-car" />}
              </svg>
            )}
            {current && current.distance.length < 2 && <p className="pw-chart-note muted">The lap’s line draws here as the driver goes round.</p>}
          </div>
          <div className="pw-legend">
            {TRACE_CHANNELS.map(({ channel, label }) => (
              <span key={channel}>
                <i className={`pw-line-key ${channel}`} />
                {label}
              </span>
            ))}
            {other && other.distance.length > 1 && (
              <span>
                <i className="pw-line-key dashed" />
                {compareLabel} {other.lapTime !== null ? lapClock(other.lapTime) : ''}
              </span>
            )}
            {compare !== 'none' && (!other || other.distance.length < 2) && <span className="muted">No {compareLabel.toLowerCase()} yet</span>}
            <span className="muted">Against distance round the lap · the line is where the car is now</span>
          </div>
        </>
      )}
    </TileFrame>
  )
}
